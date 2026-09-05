import AppKit
import Foundation
import SafariServices
import os.log

private let profileKeyFallback = "profile"
private let messageKeyFallback = "message"
private let responseKeyFallback = "message"
private let nativeBridgeLogTag = "JBE_NATIVE_BRIDGE"
private let nativeBridgeRequestTimeout: TimeInterval = 30
private let nativeBridgeCompletionBuffer: TimeInterval = 1
private let minimumImportTime: TimeInterval = 10

/// Completes a Safari extension request exactly once.
///
/// JabRef work and the timeout run on different dispatch queues. They can finish at nearly the
/// same time, so the lock ensures that only the first result is returned to Safari.
private final class RequestCompleter {
    private let context: NSExtensionContext
    private let responseKey: String
    private let lock = NSLock()
    private var didComplete = false

    init(context: NSExtensionContext, responseKey: String) {
        self.context = context
        self.responseKey = responseKey
    }

    @discardableResult
    func complete(with payload: [String: Any]) -> Bool {
        lock.lock()
        guard !didComplete else {
            lock.unlock()
            return false
        }
        didComplete = true
        lock.unlock()

        let response = NSExtensionItem()
        response.userInfo = [responseKey: payload]
        context.completeRequest(returningItems: [response], completionHandler: nil)
        return true
    }
}

private enum JabRefBridgeError: LocalizedError {
    case jabRefNotFound([String])
    case invalidPayload
    case invalidBibTeXPayload
    case processLaunchFailed(String)
    case processFailed(status: Int32, output: String)

    var errorDescription: String? {
        switch self {
        case .jabRefNotFound:
            return "Could not find JabRef. Please check that it is installed correctly."
        case .invalidPayload:
            return "Unsupported native message payload."
        case .invalidBibTeXPayload:
            return "Native message is missing the BibTeX payload."
        case .processLaunchFailed(let reason):
            return reason
        case .processFailed(_, let output):
            return output.isEmpty ? "JabRef exited with an error." : output
        }
    }
}

/// The native-message request has a fixed deadline. Every blocking operation shares this deadline
/// so the bridge never starts a command after Safari can no longer receive its result.
private struct RequestDeadline {
    let date: Date

    init(timeout: TimeInterval) {
        date = Date().addingTimeInterval(timeout)
    }

    func requireTimeRemaining(for operation: String, minimum: TimeInterval = 0) throws {
        guard date.timeIntervalSinceNow > minimum else {
            throw JabRefBridgeError.processLaunchFailed("Timed out before \(operation).")
        }
    }

    func dispatchDeadline(limitedTo maximum: TimeInterval) -> DispatchTime {
        .now() + min(maximum, max(0, date.timeIntervalSinceNow))
    }
}

private struct JabRefInstallation {
    let appURL: URL
    let executableURL: URL
}

/// Converts a native-message payload into a JabRef command-line invocation and response payload.
private struct JabRefBridge {
    func handle(message: Any, profileIdentifier: UUID?, deadline: RequestDeadline) -> [String: Any] {
        let requestId = (message as? [String: Any])?["requestId"] as? String ?? "none"

        do {
            guard let payload = message as? [String: Any] else {
                os_log(
                    "%{public}@ INVALID_PAYLOAD profile=%{public}@",
                    log: .default,
                    type: .error,
                    nativeBridgeLogTag,
                    profileIdentifier?.uuidString ?? "none",
                )
                throw JabRefBridgeError.invalidPayload
            }

            let payloadKeys = payload.keys.sorted().joined(separator: ",")
            os_log(
                "%{public}@ BEGIN requestId=%{public}@ profile=%{public}@ keys=%{public}@",
                log: .default,
                type: .default,
                nativeBridgeLogTag,
                requestId,
                profileIdentifier?.uuidString ?? "none",
                payloadKeys,
            )

            if let status = payload["status"] as? String, status == "validate" {
                let jabRef = try findJabRef()
                let output = try runJabRef(
                    at: jabRef.executableURL,
                    arguments: ["--version"],
                    deadline: deadline,
                )
                return [
                    "message": "jarFound",
                    "output": output,
                    "requestId": requestId,
                ]
            }

            guard let bibtex = payload["text"] as? String, !bibtex.isEmpty else {
                throw JabRefBridgeError.invalidBibTeXPayload
            }

            let jabRef = try findJabRef()
            try ensureJabRefIsLaunched(jabRef, deadline: deadline)
            // JabRef owns the remote-listener setting in its UI. Do not require a fixed listener
            // port here: the command-line handoff works even when that listener is disabled or
            // configured to another port.
            try deadline.requireTimeRemaining(for: "starting the import", minimum: minimumImportTime)
            let output = try runJabRef(
                at: jabRef.executableURL,
                arguments: ["--importBibtex", bibtex],
                deadline: deadline,
            )
            return [
                "message": "ok",
                "output": output,
                "requestId": requestId,
            ]
        } catch let error as JabRefBridgeError {
            return errorResponse(for: error, requestId: requestId)
        } catch {
            return [
                "message": "error",
                "output": error.localizedDescription,
                "stacktrace": String(describing: error),
                "requestId": requestId,
            ]
        }
    }

    private func errorResponse(for error: JabRefBridgeError, requestId: String) -> [String: Any] {
        switch error {
        case .jabRefNotFound(let attemptedPaths):
            os_log(
                "%{public}@ JAR_NOT_FOUND paths=%{public}@",
                log: .default,
                type: .error,
                nativeBridgeLogTag,
                attemptedPaths.joined(separator: " | "),
            )
            return [
                "message": "jarNotFound",
                "path": attemptedPaths.first ?? "",
                "output": error.localizedDescription,
                "stacktrace": attemptedPaths.joined(separator: "\n"),
                "requestId": requestId,
            ]
        case .processFailed(_, let output):
            os_log(
                "%{public}@ PROCESS_FAILED outputBytes=%{public}ld",
                log: .default,
                type: .error,
                nativeBridgeLogTag,
                output.lengthOfBytes(using: .utf8),
            )
            return [
                "message": "error",
                "output": output,
                "stacktrace": error.localizedDescription,
                "requestId": requestId,
            ]
        case .processLaunchFailed(let reason):
            os_log(
                "%{public}@ PROCESS_LAUNCH_FAILED reason=%{public}@",
                log: .default,
                type: .error,
                nativeBridgeLogTag,
                reason,
            )
            return [
                "message": "error",
                "output": reason,
                "stacktrace": reason,
                "requestId": requestId,
            ]
        default:
            os_log(
                "%{public}@ ERROR description=%{public}@",
                log: .default,
                type: .error,
                nativeBridgeLogTag,
                error.localizedDescription,
            )
            return [
                "message": "error",
                "output": error.localizedDescription,
                "stacktrace": String(describing: error),
                "requestId": requestId,
            ]
        }
    }

    private func findJabRef() throws -> JabRefInstallation {
        let fileManager = FileManager.default
        let candidates = [
            URL(fileURLWithPath: "/Applications/JabRef.app"),
            URL(fileURLWithPath: NSHomeDirectory() + "/Applications/JabRef.app"),
        ]

        for appURL in candidates {
            let executableURL = appURL.appendingPathComponent("Contents/MacOS/JabRef")
            if fileManager.isExecutableFile(atPath: executableURL.path) {
                os_log(
                    "%{public}@ FOUND_JABREF path=%{public}@",
                    log: .default,
                    type: .default,
                    nativeBridgeLogTag,
                    executableURL.path,
                )
                return JabRefInstallation(appURL: appURL, executableURL: executableURL)
            }
        }

        throw JabRefBridgeError.jabRefNotFound(candidates.map {
            $0.appendingPathComponent("Contents/MacOS/JabRef").path
        })
    }

    private func ensureJabRefIsLaunched(
        _ jabRef: JabRefInstallation,
        deadline: RequestDeadline,
    ) throws {
        guard #available(macOS 10.15, *) else {
            throw JabRefBridgeError.processLaunchFailed(
                "Starting JabRef requires macOS 10.15 or later."
            )
        }

        if NSWorkspace.shared.runningApplications.contains(where: {
            $0.bundleURL?.standardizedFileURL == jabRef.appURL.standardizedFileURL
        }) {
            os_log(
                "%{public}@ JABREF_ALREADY_RUNNING app=%{public}@",
                log: .default,
                type: .default,
                nativeBridgeLogTag,
                jabRef.appURL.path,
            )
            return
        }

        try deadline.requireTimeRemaining(for: "starting JabRef", minimum: minimumImportTime)

        let launchSemaphore = DispatchSemaphore(value: 0)
        var launchError: Error?
        var launchedApplication: NSRunningApplication?
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = false

        os_log(
            "%{public}@ LAUNCH_JABREF app=%{public}@",
            log: .default,
            type: .default,
            nativeBridgeLogTag,
            jabRef.appURL.path,
        )
        NSWorkspace.shared.openApplication(at: jabRef.appURL, configuration: configuration) { application, error in
            launchedApplication = application
            launchError = error
            launchSemaphore.signal()
        }

        guard launchSemaphore.wait(timeout: deadline.dispatchDeadline(limitedTo: minimumImportTime)) == .success else {
            throw JabRefBridgeError.processLaunchFailed("Timed out starting JabRef.")
        }
        if let launchError {
            throw JabRefBridgeError.processLaunchFailed(launchError.localizedDescription)
        }

        guard launchedApplication != nil else {
            throw JabRefBridgeError.processLaunchFailed(
                "Launch Services did not return a running JabRef application."
            )
        }
    }

    private func runJabRef(
        at executableURL: URL,
        arguments: [String],
        deadline: RequestDeadline,
    ) throws -> String {
        try deadline.requireTimeRemaining(for: "starting JabRef")
        let operation = arguments.first ?? "none"
        let payloadBytes = arguments.dropFirst().reduce(0) {
            $0 + $1.lengthOfBytes(using: .utf8)
        }
        os_log(
            "%{public}@ RUN path=%{public}@ operation=%{public}@ argumentCount=%{public}ld payloadBytes=%{public}ld",
            log: .default,
            type: .default,
            nativeBridgeLogTag,
            executableURL.path,
            operation,
            arguments.count,
            payloadBytes,
        )
        let process = Process()
        process.executableURL = executableURL
        process.arguments = arguments

        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr
        let terminationSemaphore = DispatchSemaphore(value: 0)
        process.terminationHandler = { _ in terminationSemaphore.signal() }

        do {
            try process.run()
        } catch {
            throw JabRefBridgeError.processLaunchFailed(error.localizedDescription)
        }

        // Drain both pipes while JabRef runs. Waiting for termination before reading can deadlock
        // if JabRef fills an operating-system pipe buffer with output.
        let outputReadGroup = DispatchGroup()
        var outputData = Data()
        var errorData = Data()

        outputReadGroup.enter()
        DispatchQueue.global(qos: .utility).async {
            outputData = stdout.fileHandleForReading.readDataToEndOfFile()
            outputReadGroup.leave()
        }

        outputReadGroup.enter()
        DispatchQueue.global(qos: .utility).async {
            errorData = stderr.fileHandleForReading.readDataToEndOfFile()
            outputReadGroup.leave()
        }

        guard terminationSemaphore.wait(timeout: deadline.dispatchDeadline(limitedTo: nativeBridgeRequestTimeout)) == .success else {
            process.terminate()
            throw JabRefBridgeError.processLaunchFailed("Timed out importing into JabRef.")
        }
        outputReadGroup.wait()
        let output = String(data: outputData + errorData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        guard process.terminationStatus == 0 else {
            throw JabRefBridgeError.processFailed(status: process.terminationStatus, output: output)
        }

        os_log(
            "%{public}@ RUN_OK path=%{public}@",
            log: .default,
            type: .default,
            nativeBridgeLogTag,
            executableURL.path,
        )

        return output
    }
}

/// Bridges Safari Web Extension native messages to the local JabRef application.
///
/// Safari calls `beginRequest` after JavaScript invokes `browser.runtime.sendNativeMessage`.
/// The incoming message is stored in an `NSExtensionItem` user-info dictionary; this handler
/// places its response in a matching extension item and completes the provided context.
///
/// Import requests start JabRef independently through Launch Services when necessary, then hand
/// the received BibTeX to its already-running instance. Bridge work runs off the request callback
/// so Safari stays responsive; a timeout returns an error if no response is available in time.
class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    private let bridge = JabRefBridge()
    private let bridgeQueue = DispatchQueue(
        label: "org.jabref.browser-extension.native-bridge",
        qos: .userInitiated,
    )

    func beginRequest(with context: NSExtensionContext) {
        os_log("%{public}@ BEGIN_REQUEST", log: .default, type: .default, nativeBridgeLogTag)
        guard let request = context.inputItems.first as? NSExtensionItem,
              let userInfo = request.userInfo else {
            os_log("%{public}@ MISSING_REQUEST", log: .default, type: .error, nativeBridgeLogTag)
            context.completeRequest(returningItems: nil, completionHandler: nil)
            return
        }

        let profileIdentifier: UUID?
        if #available(iOS 17.0, macOS 14.0, *) {
            profileIdentifier = userInfo[SFExtensionProfileKey] as? UUID
        } else {
            profileIdentifier = userInfo[profileKeyFallback] as? UUID
        }

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = userInfo[SFExtensionMessageKey]
        } else {
            message = userInfo[messageKeyFallback]
        }

        guard let message else {
            os_log("%{public}@ MISSING_MESSAGE", log: .default, type: .error, nativeBridgeLogTag)
            context.completeRequest(returningItems: nil, completionHandler: nil)
            return
        }

        let responseKey: String
        if #available(iOS 15.0, macOS 11.0, *) {
            responseKey = SFExtensionMessageKey
        } else {
            responseKey = responseKeyFallback
        }

        let requestId = (message as? [String: Any])?["requestId"] as? String ?? "none"
        let completer = RequestCompleter(context: context, responseKey: responseKey)
        let bridge = bridge

        let deadline = RequestDeadline(
            timeout: nativeBridgeRequestTimeout - nativeBridgeCompletionBuffer,
        )

        bridgeQueue.async {
            let responsePayload = bridge.handle(
                message: message,
                profileIdentifier: profileIdentifier,
                deadline: deadline,
            )
            if completer.complete(with: responsePayload) {
                os_log("%{public}@ COMPLETE_REQUEST requestId=%{public}@", log: .default, type: .default, nativeBridgeLogTag, requestId)
            }
        }

        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + nativeBridgeRequestTimeout) {
            if completer.complete(with: [
                "message": "error",
                "output": "Timed out waiting for JabRef.",
                "stacktrace": "Native bridge timed out after \(Int(nativeBridgeRequestTimeout)) seconds.",
                "requestId": requestId,
            ]) {
                os_log("%{public}@ REQUEST_TIMED_OUT requestId=%{public}@", log: .default, type: .error, nativeBridgeLogTag, requestId)
            }
        }
    }
}
