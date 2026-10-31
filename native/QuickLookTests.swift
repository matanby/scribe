import Cocoa
import WebKit

@main
struct QuickLookTests {
    static func main() throws {
        if CommandLine.arguments.contains("--benchmark") {
            try benchmark()
            return
        }
        _ = NSApplication.shared
        NSApp.setActivationPolicy(.prohibited)
        let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 650))
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let file = folder.appendingPathComponent("preview.md")
        let markdown = #"""
        ---
        title: hidden metadata
        ---
        # Hello

        שלום English

        - English item
        - פריט עברי

        - [x] משימה
        - [ ] Task

        <div dir="ltr"><p>שלום override</p></div>

        <ul data-type="taskList"><li data-type="taskItem" data-checked="true" dir="rtl"><label><input type="checkbox" checked></label><div><p>משימה שמורה</p></div></li></ul>

        | Name | Value |
        | --- | --- |
        | A | B |

        ```js
        const value = 1;
        ```

        ==highlight==

        ![Local image](assets/photo.png)

        [Unsafe](javascript:alert(1))

        <script>window.pwned = true</script>
        <img src="https://example.com/tracker.png" onerror="window.pwned = true">
        <iframe src="file:///etc/passwd"></iframe>

        ## Nested checklists

        - [ ] Parent task
          - [X] Nested task

        1. [ ] Ordered task

        [x] This is a paragraph, not a task
        """#
        try markdown.write(to: file, atomically: true, encoding: .utf8)
        var finished = false
        var failure: Error?
        let html = try PreviewProvider.previewHTML(at: file)
        webView.loadHTMLString(html, baseURL: nil)
        let loadDeadline = Date().addingTimeInterval(15)
        while webView.isLoading && Date() < loadDeadline { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
        let script = #"""
        (() => {
          const root = document.getElementById('preview');
          const checks = {
            'Markdown headings': root.querySelector('h1')?.textContent === 'Hello',
            'front matter hidden': !root.textContent.includes('hidden metadata'),
            'Hebrew paragraph': [...root.querySelectorAll('p')].some(p => p.textContent === 'שלום English' && p.dir === 'rtl'),
            'mixed list markers': root.querySelector('ul').dir === 'rtl' && [...root.querySelectorAll('ul > li:not(.task-list-item):not([data-type="taskItem"])')].every(li => li.dir === 'rtl'),
            'Hebrew checkbox alignment': root.querySelector('.task-list-item').dir === 'rtl',
            'English checkbox alignment': root.querySelectorAll('.task-list-item')[1].dir === 'ltr',
            'checkbox states': root.querySelectorAll('input:checked').length === 3 && [...root.querySelectorAll('input')].every(input => input.disabled),
            'nested and ordered checklists': !!root.querySelector('li.task-list-item li.task-list-item input:checked') && !!root.querySelector('ol > li.task-list-item input') && root.querySelectorAll('input').length === 6,
            'task-like paragraphs remain text': [...root.querySelectorAll('p')].some(p => p.textContent === '[x] This is a paragraph, not a task' && !p.querySelector('input')),
            'explicit direction': [...root.querySelectorAll('p')].some(p => p.textContent === 'שלום override' && p.dir === 'ltr'),
            'saved HTML checklists': root.querySelector('[data-type="taskItem"]').dir === 'rtl',
            'tables and fenced code': !!root.querySelector('table') && !!root.querySelector('pre code'),
            'highlights': root.querySelector('mark')?.textContent === 'highlight',
            'attachment labels': root.querySelector('.attachment')?.textContent === 'Local image',
            'untrusted HTML cannot execute': !window.pwned && !root.querySelector('script, iframe, [onerror]'),
            'no network or local image loads': !root.querySelector('img'),
            'read-only links': !root.querySelector('a[href]'),
          };
          return checks;
        })()
        """#
        webView.evaluateJavaScript(script) { value, error in
            if let error { failure = error }
            else if let checks = value as? [String: Bool] {
                for name in checks.keys.sorted() {
                    print("  \(checks[name]! ? "ok" : "FAIL")  \(name)")
                }
                fflush(stdout)
                if checks.values.contains(false) {
                    failure = NSError(domain: "QuickLookTests", code: 1)
                }
            } else { failure = NSError(domain: "QuickLookTests", code: 2) }
            finished = true
        }
        let deadline = Date().addingTimeInterval(20)
        while !finished && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
        if !finished { throw NSError(domain: "QuickLookTests.Timeout", code: 1) }
        if let failure { throw failure }

        // A reused renderer must read new content and keep concurrent requests separate.
        try "# Updated content".write(to: file, atomically: true, encoding: .utf8)
        let updated = try PreviewProvider.previewHTML(at: file)
        guard updated.contains("Updated content"), !updated.contains("Hello") else {
            throw NSError(domain: "QuickLookTests.StaleContent", code: 1)
        }
        print("  ok  reused renderer reads updated files")
        let files = try (0..<12).map { index -> URL in
            let url = folder.appendingPathComponent("concurrent-\(index).md")
            try "# request-\(index)-only".write(to: url, atomically: true, encoding: .utf8)
            return url
        }
        let lock = NSLock()
        var concurrentFailures = 0
        DispatchQueue.concurrentPerform(iterations: files.count) { index in
            let html = try? PreviewProvider.previewHTML(at: files[index])
            if html?.contains("request-\(index)-only") != true || html?.contains("Updated content") == true {
                lock.lock(); concurrentFailures += 1; lock.unlock()
            }
        }
        guard concurrentFailures == 0 else { throw NSError(domain: "QuickLookTests.ConcurrentRequests", code: 1) }
        print("  ok  concurrent requests keep their own content")

        // Exercise the native file-read limit.
        try Data(repeating: 65, count: 2 * 1024 * 1024 + 1).write(to: file)
        var rejected = false
        do { _ = try PreviewProvider.previewHTML(at: file) } catch { rejected = true }
        guard rejected else { throw NSError(domain: "QuickLookTests.FileLimit", code: 1) }
        print("  ok  oversized file rejected")
        // A rejected file must not poison the shared renderer.
        try "# After error".write(to: file, atomically: true, encoding: .utf8)
        guard try PreviewProvider.previewHTML(at: file).contains("After error") else {
            throw NSError(domain: "QuickLookTests.Recovery", code: 1)
        }
        print("  ok  renderer recovers after rejected files")
        print("\n21 JavaScriptCore rendering and native WebKit display checks passed")
    }

    static func benchmark() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let file = folder.appendingPathComponent("benchmark.md")
        let samples = [
            ("Short note", "# Hello\n\nשלום English\n\n- [x] משימה\n- [ ] Task\n"),
            ("README", try String(contentsOfFile: "README.md", encoding: .utf8)),
            ("1,000 tasks", "# Tasks\n\n" + String(repeating: "- [x] משימה **Hebrew**\n- [ ] English task\n", count: 500)),
        ]
        for (name, markdown) in samples {
            try markdown.write(to: file, atomically: true, encoding: .utf8)
            var times: [Double] = []
            for _ in 0..<21 {
                let start = DispatchTime.now().uptimeNanoseconds
                let html = try PreviewProvider.previewHTML(at: file)
                guard html.contains("id=\"preview\"") else { throw NSError(domain: "Benchmark", code: 1) }
                times.append(Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000)
            }
            print(String(format: "%@: first %.2f ms, subsequent median %.2f ms", name, times[0], times.dropFirst().sorted()[10]))
        }
    }
}
