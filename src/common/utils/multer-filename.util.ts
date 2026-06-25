/** multer 默认按 latin1 解析 multipart 文件名，中文需转回 utf8 */
export function decodeMulterOriginalName(originalname: string): string {
  return Buffer.from(originalname, 'latin1').toString('utf8');
}
