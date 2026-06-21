import Foundation
import SafariServices
import os.log

private let profileKeyFallback = "profile"
private let messageKeyFallback = "message"
private let responseKeyFallback = "message"
private let nativeBridgeLogTag = "JBE_NATIVE_BRIDGE"

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

private struct JabRefBridge {
    func handle(message: Any, profileIdentifier: UUID?) -> [String: Any] {
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

            let requestId = (payload["requestId"] as? String) ?? "none"
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
                let jabRefURL = try findJabRef()
                let output = try runJabRef(at: jabRefURL, arguments: ["--version"])
                return [
                    "message": "jarFound",
                    "output": output,
                    "requestId": requestId,
                ]
            }

            guard let bibtex = payload["text"] as? String, !bibtex.isEmpty else {
                throw JabRefBridgeError.invalidBibTeXPayload
            }

            let jabRefURL = try findJabRef()
            let output = try runJabRef(at: jabRefURL, arguments: ["--importBibtex", bibtex])
            return [
                "message": "ok",
                "output": output,
                "requestId": requestId,
            ]
        } catch let error as JabRefBridgeError {
            return errorResponse(for: error)
        } catch {
            return [
                "message": "error",
                "output": error.localizedDescription,
                "stacktrace": String(describing: error),
            ]
        }
    }

    private func errorResponse(for error: JabRefBridgeError) -> [String: Any] {
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
            ]
        case .processFailed(_, let output):
            os_log(
                "%{public}@ PROCESS_FAILED output=%{public}@",
                log: .default,
                type: .error,
                nativeBridgeLogTag,
                output,
            )
            return [
                "message": "error",
                "output": output,
                "stacktrace": error.localizedDescription,
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
            ]
        }
    }

    private func findJabRef() throws -> URL {
        let fileManager = FileManager.default
        let candidates = [
            "/Applications/JabRef.app/Contents/MacOS/JabRef",
            NSHomeDirectory() + "/Applications/JabRef.app/Contents/MacOS/JabRef",
        ]

        for candidate in candidates {
            if fileManager.isExecutableFile(atPath: candidate) {
                os_log(
                    "%{public}@ FOUND_JABREF path=%{public}@",
                    log: .default,
                    type: .default,
                    nativeBridgeLogTag,
                    candidate,
                )
                return URL(fileURLWithPath: candidate)
            }
        }

        throw JabRefBridgeError.jabRefNotFound(candidates)
    }

    private func runJabRef(at executableURL: URL, arguments: [String]) throws -> String {
        os_log(
            "%{public}@ RUN path=%{public}@ args=%{public}@",
            log: .default,
            type: .default,
            nativeBridgeLogTag,
            executableURL.path,
            arguments.joined(separator: " "),
        )
        let process = Process()
        process.executableURL = executableURL
        process.arguments = arguments

        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr

        do {
            try process.run()
        } catch {
            throw JabRefBridgeError.processLaunchFailed(error.localizedDescription)
        }

        process.waitUntilExit()

        let outputData = stdout.fileHandleForReading.readDataToEndOfFile()
        let errorData = stderr.fileHandleForReading.readDataToEndOfFile()
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

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    private let bridge = JabRefBridge()

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

        let responsePayload = bridge.handle(message: message, profileIdentifier: profileIdentifier)
        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: responsePayload]
        } else {
            response.userInfo = [responseKeyFallback: responsePayload]
        }

        os_log("%{public}@ COMPLETE_REQUEST", log: .default, type: .default, nativeBridgeLogTag)
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
