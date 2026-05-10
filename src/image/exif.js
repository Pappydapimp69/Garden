// Hand-rolled JPEG/EXIF parser. Extracts DateTimeOriginal or DateTime tag
// from a JPEG's EXIF data and returns the capture date as epoch milliseconds.
// Returns null if EXIF is missing, unreadable, or the file is not a JPEG.
// Never throws — all errors are caught and yield null.

export async function extractCaptureDate(file) {
  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);

    // JPEG SOI magic must be 0xFFD8.
    if (view.byteLength < 2 || view.getUint16(0) !== 0xFFD8) {
      return null;
    }

    let offset = 2;
    let dateTimeOriginal = null;
    let dateTime = null;

    // Walk JPEG markers.
    while (offset < view.byteLength) {
      if (view.getUint8(offset) !== 0xFF) break;
      const marker = view.getUint8(offset + 1);

      // SOS (start of scan) or EOI (end of image) — stop scanning.
      if (marker === 0xDA || marker === 0xD9) break;

      if (offset + 4 > view.byteLength) break;
      const segmentLen = view.getUint16(offset + 2);
      const segmentEnd = offset + 2 + segmentLen;

      if (segmentEnd > view.byteLength) break;

      // APP1 marker (0xE1) — potential EXIF.
      if (marker === 0xE1) {
        const exifData = parseExif(view, offset + 4, segmentEnd);
        if (exifData) {
          dateTimeOriginal = exifData.dateTimeOriginal;
          dateTime = exifData.dateTime;
          if (dateTimeOriginal) break;  // Prefer DateTimeOriginal if found.
        }
      }

      offset = segmentEnd;
    }

    // Use DateTimeOriginal if available, else fall back to DateTime.
    const dateStr = dateTimeOriginal || dateTime;
    if (!dateStr) return null;

    return parseExifDate(dateStr);
  } catch {
    return null;
  }
}

function parseExif(view, start, end) {
  try {
    // Verify "Exif\0\0" header.
    if (end - start < 6) return null;
    const exifHeader = String.fromCharCode(
      view.getUint8(start),
      view.getUint8(start + 1),
      view.getUint8(start + 2),
      view.getUint8(start + 3)
    );
    if (exifHeader !== 'Exif') return null;

    const tiffStart = start + 6;
    if (end - tiffStart < 8) return null;

    // Read TIFF byte order (II=LE, MM=BE) and magic (0x002A).
    const littleEndian = view.getUint16(tiffStart) === 0x4949;
    const magic = view.getUint16(tiffStart + 2, littleEndian);
    if (magic !== 0x002A) return null;

    // Read IFD0 offset.
    const ifd0Offset = tiffStart + view.getUint32(tiffStart + 4, littleEndian);
    if (ifd0Offset > end - 2) return null;

    // Parse IFD0 for ExifIFDPointer and DateTime.
    const ifdResult = parseIFD(view, ifd0Offset, end, littleEndian, tiffStart);
    if (!ifdResult) return null;

    let dateTimeOriginal = null;
    let dateTime = ifdResult.dateTime;

    // Parse EXIF sub-IFD if we found the pointer.
    if (ifdResult.exifIfdOffset) {
      const exifIfd = parseIFD(view, ifdResult.exifIfdOffset, end, littleEndian, tiffStart);
      if (exifIfd) {
        dateTimeOriginal = exifIfd.dateTimeOriginal;
      }
    }

    return { dateTimeOriginal, dateTime };
  } catch {
    return null;
  }
}

function parseIFD(view, ifdOffset, end, littleEndian, tiffStart) {
  try {
    if (ifdOffset + 2 > end) return null;

    const entryCount = view.getUint16(ifdOffset, littleEndian);
    let offset = ifdOffset + 2;

    let exifIfdOffset = null;
    let dateTime = null;
    let dateTimeOriginal = null;

    for (let i = 0; i < entryCount; i++) {
      if (offset + 12 > end) break;

      const tag = view.getUint16(offset, littleEndian);
      const type = view.getUint16(offset + 2, littleEndian);
      const count = view.getUint32(offset + 4, littleEndian);
      const valueOffset = offset + 8;

      // Tag 0x8769: ExifIFDPointer (LONG).
      if (tag === 0x8769 && type === 4) {
        exifIfdOffset = tiffStart + view.getUint32(valueOffset, littleEndian);
      }

      // Tag 0x0132: DateTime (ASCII).
      if (tag === 0x0132 && type === 2 && count === 20) {
        const dataOffset = view.getUint32(valueOffset, littleEndian);
        if (tiffStart + dataOffset + 20 <= end) {
          dateTime = readAsciiString(view, tiffStart + dataOffset, 19);
        }
      }

      // Tag 0x9003: DateTimeOriginal (ASCII).
      if (tag === 0x9003 && type === 2 && count === 20) {
        const dataOffset = view.getUint32(valueOffset, littleEndian);
        if (tiffStart + dataOffset + 20 <= end) {
          dateTimeOriginal = readAsciiString(view, tiffStart + dataOffset, 19);
        }
      }

      offset += 12;
    }

    return { exifIfdOffset, dateTime, dateTimeOriginal };
  } catch {
    return null;
  }
}

function readAsciiString(view, offset, length) {
  let str = '';
  for (let i = 0; i < length; i++) {
    const code = view.getUint8(offset + i);
    if (code === 0) break;
    str += String.fromCharCode(code);
  }
  return str;
}

function parseExifDate(dateStr) {
  // EXIF format: "YYYY:MM:DD HH:MM:SS"
  const match = dateStr.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, y, mo, d, h, min, s] = match.map(Number);

  // Construct a local Date (EXIF is interpreted as local time).
  const date = new Date(y, mo - 1, d, h, min, s);
  const ms = date.getTime();

  // Validate: if the parsed date doesn't match inputs, date construction failed.
  if (isNaN(ms) || date.getFullYear() !== y) {
    return null;
  }

  return ms;
}
