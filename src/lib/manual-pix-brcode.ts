/**
 * Generates an EMV Pix BR Code for a static Pix key without any bank API.
 * The key must belong to the merchant and be configured on the SERVER;
 * displaying the Pix payload makes its receiving key visible to customers.
 * Manual matching of the incoming transfer remains essential.
 */
function field(id: string, value: string): string {
 const len = new TextEncoder().encode(value).length;
 if (len > 99) throw new Error("Pix BR Code field too long");
 return id + String(len).padStart(2,"0") + value;
}
function crc16(input: string): string {
 let crc=0xffff;
 for(const byte of new TextEncoder().encode(input)){
   crc ^= byte << 8;
   for(let j=0;j<8;j++) crc=(crc & 0x8000) ? ((crc<<1)^0x1021)&0xffff : (crc<<1)&0xffff;
 }
 return crc.toString(16).toUpperCase().padStart(4,"0");
}
export function generateManualPixCode(input: {
 key: string; amountCents: number; merchantName: string; merchantCity: string; reference: string;
}): string {
 if (!input.key || input.key.length > 77) throw new Error("Invalid Pix key");
 if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 1) throw new Error("Invalid amount");
 const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9 .-]/g," ").trim().toUpperCase();
 const name=normalize(input.merchantName).slice(0,25);
 const city=normalize(input.merchantCity).slice(0,15);
 const ref=normalize(input.reference).replace(/[^A-Z0-9]/g,"").slice(0,25);
 if (!name || !city || !ref) throw new Error("Missing merchant identity or reference");
 const merchant=field("00","br.gov.bcb.pix")+field("01",input.key);
 const body=field("00","01")
  + field("26",merchant)
  + field("52","0000")
  + field("53","986")
  + field("54",(input.amountCents/100).toFixed(2))
  + field("58","BR")
  + field("59",name)
  + field("60",city)
  + field("62",field("05",ref));
 const withChecksum=body+"6304";
 return withChecksum+crc16(withChecksum);
}
