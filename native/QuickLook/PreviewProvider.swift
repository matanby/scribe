import Cocoa
import JavaScriptCore
import QuickLookUI
import UniformTypeIdentifiers

@objc(PreviewProvider)
final class PreviewProvider: QLPreviewProvider, QLPreviewingController {
    // Quick Look reuses the extension process when browsing files. Keep its
    // parser and template ready, and serialize access to JavaScriptCore.
    private static let rendererQueue = DispatchQueue(label: "com.scribe.quicklook.renderer", qos: .userInitiated)
    private static var renderer: Renderer?

    static func previewHTML(at url: URL) throws -> String {
        let markdown = try readMarkdown(at: url)
        return try rendererQueue.sync {
            if renderer == nil { renderer = try Renderer() }
            return try renderer!.render(markdown)
        }
    }

    private static func readMarkdown(at url: URL) throws -> String {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let file = try FileHandle(forReadingFrom: url)
        defer { try? file.close() }
        let limit = 2 * 1024 * 1024
        let data = try file.read(upToCount: limit + 1) ?? Data()
        guard data.count <= limit else {
            throw NSError(domain: "ScribeQuickLook", code: 1, userInfo: [NSLocalizedDescriptionKey: "This Markdown file is too large to preview (maximum 2 MB)."])
        }
        guard let markdown = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .utf16) else {
            throw NSError(domain: NSCocoaErrorDomain, code: NSFileReadInapplicableStringEncodingError)
        }
        return markdown
    }

    private final class Renderer {
        let context: JSContext
        let renderFunction: JSValue
        let template: String

        init() throws {
            let bundle = Bundle(for: PreviewProvider.self)
            guard let templateURL = bundle.url(forResource: "preview", withExtension: "html"),
                  let scriptURL = bundle.url(forResource: "preview", withExtension: "js") else {
                throw previewError("The Markdown renderer is missing from this installation.")
            }
            template = try String(contentsOf: templateURL, encoding: .utf8)
            let script = try String(contentsOf: scriptURL, encoding: .utf8)
            guard let context = JSContext() else { throw previewError("Could not create the Markdown renderer.") }
            self.context = context
            // JavaScriptCore omits browser globals. The HTML entity decoder uses
            // atob to unpack its bundled lookup table; expose only that pure helper.
            let decodeBase64: @convention(block) (String) -> String? = { encoded in
                guard let data = Data(base64Encoded: encoded) else { return nil }
                return String(data: data, encoding: .isoLatin1)
            }
            context.setObject(decodeBase64, forKeyedSubscript: "atob" as NSString)
            context.evaluateScript(script)
            guard context.exception == nil,
                  let function = context.objectForKeyedSubscript("ScribePreview")?.forProperty("renderPreviewHTML"),
                  !function.isUndefined else {
                throw previewError("Could not initialize the Markdown renderer.")
            }
            renderFunction = function
        }

        func render(_ markdown: String) throws -> String {
            context.exception = nil
            guard let result = renderFunction.call(withArguments: [markdown]),
                  context.exception == nil, !result.isUndefined, let html = result.toString() else {
                throw previewError("Could not render this Markdown file.")
            }
            return template.replacingOccurrences(of: "<!--SCRIBE_CONTENT-->", with: html)
        }
    }

    private static func previewError(_ message: String) -> NSError {
        NSError(domain: "ScribeQuickLook", code: 2, userInfo: [NSLocalizedDescriptionKey: message])
    }

    func providePreview(for request: QLFilePreviewRequest, completionHandler handler: @escaping (QLPreviewReply?, Error?) -> Void) {
        do {
            let html = try Self.previewHTML(at: request.fileURL)
            let reply = QLPreviewReply(dataOfContentType: .html, contentSize: NSSize(width: 800, height: 650)) { reply in
                reply.stringEncoding = .utf8
                return Data(html.utf8)
            }
            handler(reply, nil)
        } catch { handler(nil, error) }
    }
}
