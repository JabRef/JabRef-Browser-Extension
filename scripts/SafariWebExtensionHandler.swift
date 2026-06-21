import Foundation
import SafariServices
import os.log

private let profileKeyFallback = "profile"
private let messageKeyFallback = "message"
private let responseKeyFallback = "message"

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
        os_log(
            "Received native message from Safari extension. profile=%{public}@",
            log: .default,
            type: .default,
            profileIdentifier?.uuidString ?? "none",
        )

        do {
            guard let payload = message as? [String: Any] else {
                throw JabRefBridgeError.invalidPayload
            }

            if let status = payload["status"] as? String, status == "validate" {
                let jabRefURL = try findJabRef()
                let output = try runJabRef(at: jabRefURL, arguments: ["--version"])
                return [
                    "message": "jarFound",
                    "output": output,
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
            return [
                "message": "jarNotFound",
                "path": attemptedPaths.first ?? "",
                "output": error.localizedDescription,
                "stacktrace": attemptedPaths.joined(separator: "\n"),
            ]
        case .processFailed(_, let output):
            return [
                "message": "error",
                "output": output,
                "stacktrace": error.localizedDescription,
            ]
        case .processLaunchFailed(let reason):
            return [
                "message": "error",
                "output": reason,
                "stacktrace": reason,
            ]
        default:
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
                return URL(fileURLWithPath: candidate)
            }
        }

        throw JabRefBridgeError.jabRefNotFound(candidates)
    }

    private func runJabRef(at executableURL: URL, arguments: [String]) throws -> String {
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

        return output
    }
}

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    private let bridge = JabRefBridge()

    func beginRequest(with context: NSExtensionContext) {
        guard let request = context.inputItems.first as? NSExtensionItem,
              let userInfo = request.userInfo else {
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

        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
