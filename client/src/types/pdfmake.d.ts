declare module "pdfmake/interfaces" {
  export type Content = any;
  export type TableCell = any;
  export type TDocumentDefinitions = any;
}

declare module "pdfmake/build/pdfmake" {
  const pdfMake: any;
  export default pdfMake;
}

declare module "pdfmake/build/vfs_fonts" {
  const pdfFonts: any;
  export default pdfFonts;
}

declare module "pdfmake" {
  const PdfPrinter: any;
  export default PdfPrinter;
}
