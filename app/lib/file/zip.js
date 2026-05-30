"use client";

function toUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (input instanceof Blob) {
    throw new Error("Blob inputs must be converted before zipping");
  }
  if (typeof input === "string") return new TextEncoder().encode(input);
  return new Uint8Array();
}

function crc32(bytes) {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (~crc) >>> 0;
}

function dosTimeDate(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  return { dosDate, dosTime };
}

function concatUint8(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u16(value) {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value, true);
  return out;
}

function u32(value) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

function getNameBytes(name) {
  return new TextEncoder().encode(name);
}

async function blobToBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

export async function createZipBlob(files) {
  const entries = [];
  const fileData = [];
  let offset = 0;

  for (const file of files || []) {
    const nameBytes = getNameBytes(file.name);
    const data = file.data instanceof Blob ? await blobToBytes(file.data) : toUint8Array(file.data);
    const crc = crc32(data);
    const { dosDate, dosTime } = dosTimeDate(file.date || new Date());

    const localHeader = concatUint8([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ]);

    entries.push({
      nameBytes,
      crc,
      size: data.length,
      offset,
      dosTime,
      dosDate,
    });
    fileData.push(localHeader);
    offset += localHeader.length;
  }

  const centralDirectory = [];
  let centralSize = 0;
  for (const entry of entries) {
    const central = concatUint8([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(entry.dosTime),
      u16(entry.dosDate),
      u32(entry.crc),
      u32(entry.size),
      u32(entry.size),
      u16(entry.nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(entry.offset),
      entry.nameBytes,
    ]);
    centralDirectory.push(central);
    centralSize += central.length;
  }

  const centralOffset = offset;
  const endRecord = concatUint8([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralSize),
    u32(centralOffset),
    u16(0),
  ]);

  return new Blob([...fileData, ...centralDirectory, endRecord], { type: "application/zip" });
}
