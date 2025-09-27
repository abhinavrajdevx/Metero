import type { ServiceMeta } from "./types.js";

export function quotePrice6(service: ServiceMeta, input: any): bigint {
  switch (service.unit) {
    case "call":  return service.pricePerUnit6;
    case "chars": {
      const text = String(input?.text ?? "");
      const bytes = Buffer.from(text, "utf8").length;
      const k = BigInt(Math.ceil(bytes / 1000));
      return BigInt(k) * service.pricePerUnit6;
    }
    case "pages": {
      const pages = BigInt(input?.pages ?? 1);
      return pages * service.pricePerUnit6;
    }
  }
}
