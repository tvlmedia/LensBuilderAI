import Foundation
import PDFKit

struct PageText: Codable {
  let pageNumber: Int
  let text: String
}

struct Payload: Codable {
  let ok: Bool
  let pages: [PageText]?
  let error: String?
}

func writeJson(_ payload: Payload) {
  let encoder = JSONEncoder()
  encoder.outputFormatting = []
  do {
    let data = try encoder.encode(payload)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
  } catch {
    let fallback = "{\"ok\":false,\"error\":\"JSON encoding failed\"}\n"
    FileHandle.standardOutput.write(Data(fallback.utf8))
  }
}

guard CommandLine.arguments.count == 2 else {
  writeJson(Payload(ok: false, pages: nil, error: "Usage: extract-pdf-text.swift <pdf>"))
  exit(2)
}

let pdfPath = CommandLine.arguments[1]
let url = URL(fileURLWithPath: pdfPath)

guard let document = PDFDocument(url: url) else {
  writeJson(Payload(ok: false, pages: nil, error: "Could not open PDF"))
  exit(1)
}

var pages: [PageText] = []
for pageIndex in 0..<document.pageCount {
  let page = document.page(at: pageIndex)
  pages.append(PageText(pageNumber: pageIndex + 1, text: page?.string ?? ""))
}

writeJson(Payload(ok: true, pages: pages, error: nil))
