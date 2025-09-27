import { Service } from "./types.js";

export function quotePrice6(service: Service, input: any): bigint {
  switch (service.unit) {
    case "call": return service.pricePerUnit6;
    case "chars": {
      const text: string = String(input?.text ?? "");
      const chars = BigInt(Buffer.from(text, "utf8").length);
      const k = (chars + 999n) / 1000n; // ceil
      return k * service.pricePerUnit6;
    }
    case "pages": {
      const pages = BigInt(input?.pages ?? 1);
      return pages * service.pricePerUnit6;
    }
  }
}
