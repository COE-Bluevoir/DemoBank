/**
 * Generates the synthetic documents the storyline packs require but which
 * were not supplied.
 *
 * Rendered from HTML with the browser Playwright already provides, so the
 * output is a real PNG an OCR pipeline can read — not a placeholder.
 *
 * Every document is stamped SAMPLE - NOT VALID - OCR TEST. The agent test
 * matrix requires that marking to survive into the demo, so it is baked into
 * the shared template rather than left to each document.
 *
 *   node scripts/generate-sample-docs.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const OUT = path.join(process.cwd(), "public", "sample-docs");

const REGISTERED_ADDRESS = "2nd Floor, 14 MG Road,<br>Bengaluru, Karnataka 560001";
const SITE_ADDRESS = "Plot 8, Electronic City Phase 1,<br>Bengaluru, Karnataka 560100";

/** Shared chrome: the watermark, the footer, and the print-like typography. */
function page(title, body, accent = "#1B4F8A") {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 28px 34px; width: 1450px;
      font-family: "Segoe UI", Arial, sans-serif; color: #111; background: #fff;
      position: relative;
    }
    .watermark {
      position: absolute; inset: 0; display: flex; align-items: center;
      justify-content: center; pointer-events: none;
    }
    .watermark span {
      transform: rotate(-24deg); font-size: 78px; font-weight: 700;
      color: rgba(120,120,120,0.22); white-space: nowrap; letter-spacing: 2px;
    }
    h1 { font-size: 30px; margin: 0; color: ${accent}; }
    .brand { display: flex; justify-content: space-between; align-items: flex-start;
             border-bottom: 3px solid ${accent}; padding-bottom: 14px; }
    .brand .org { font-size: 26px; font-weight: 700; color: ${accent}; }
    .brand .meta { text-align: right; font-size: 13px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 14px; }
    th, td { border: 1px solid #BFC7D2; padding: 9px 12px; text-align: left; vertical-align: top; }
    th { background: #EEF3F9; font-weight: 600; width: 260px; }
    .section { margin-top: 22px; font-size: 15px; font-weight: 700; color: ${accent};
               border-left: 4px solid ${accent}; padding-left: 10px; }
    .note { margin-top: 20px; font-size: 12.5px; color: #444; line-height: 1.7; }
    .foot { margin-top: 26px; border-top: 1px solid #CCC; padding-top: 10px;
            text-align: center; font-size: 13px; font-weight: 600; }
    .sig { margin-top: 34px; display: flex; justify-content: space-between; font-size: 13px; }
    .sig div { width: 40%; }
    .sig .line { margin-top: 40px; border-top: 1px solid #333; padding-top: 5px; }
  </style></head><body>
    <div class="watermark"><span>SAMPLE - NOT VALID - OCR TEST</span></div>
    ${body}
    <div class="foot">For OCR Testing Only</div>
  </body></html>`;
}

const DOCUMENTS = [
  {
    /**
     * The corrected telephone bill.
     *
     * Identical to the mismatch bill except the service address now equals the
     * registered office. Without this file the banking storyline's correction
     * round-trip cannot be demonstrated: the customer has nothing to re-upload.
     */
    file: "B05_telephone_bill_address_corrected.png",
    html: page(
      "BharatTel",
      `<div class="brand">
         <div>
           <div class="org">BharatTel</div>
           <div style="font-size:13px;color:#555">Connecting India, Connecting Business</div>
           <h1 style="margin-top:12px">Business Landline Bill</h1>
         </div>
         <div class="meta">
           <b>BharatTel Communications Limited</b><br>
           CIN: U74899DL2000PLC107669<br>
           BharatTel House, Connaught Place,<br>New Delhi - 110001<br>
           GSTIN: 07AACCB2894G1ZJ
         </div>
       </div>
       <table>
         <tr><th>Account No.</th><td>1045872391</td><th>Landline No.</th><td>080-44556677</td></tr>
         <tr><th>Bill Date</th><td>05/09/2026</td><th>Due Date</th><td>20/09/2026</td></tr>
         <tr><th>Bill Period</th><td>01/08/2026 to 31/08/2026</td><th>Amount Due</th><td><b>INR 4,780.00</b></td></tr>
       </table>
       <div class="section">Addresses</div>
       <table>
         <tr><th>Subscriber Name</th><td colspan="3">Sunspire Retail Private Limited</td></tr>
         <tr><th>Billing Address</th><td>${REGISTERED_ADDRESS}</td>
             <th>Service Address</th><td>${REGISTERED_ADDRESS}</td></tr>
       </table>
       <div class="note">
         <b>Note:</b> The service address has been updated to the registered office
         following the subscriber's relocation request. Billing and service
         addresses now match.
       </div>
       <div class="section">Details of Charges</div>
       <table>
         <tr><th>Monthly Rental - Business Landline</th><td>INR 1,200.00</td>
             <th>Broadband on Landline</th><td>INR 799.00</td></tr>
         <tr><th>Local / STD / ISD Calls</th><td>INR 1,981.80</td>
             <th>Taxes (GST)</th><td>INR 799.20</td></tr>
         <tr><th>Total Amount Due</th><td colspan="3"><b>INR 4,780.00</b></td></tr>
       </table>`,
    ),
  },
  {
    file: "I05_property_schedule.png",
    html: page(
      "ShieldSure",
      `<div class="brand">
         <div>
           <div class="org">ShieldSure</div>
           <div style="font-size:13px;color:#555">INSURANCE</div>
           <h1 style="margin-top:12px">Property Schedule</h1>
         </div>
         <div class="meta">
           Schedule No.: SS/PS/26-27/000123<br>
           Date: 20/05/2026<br>
           Linked Proposal: SS/CP/24-25/000123
         </div>
       </div>
       <table>
         <tr><th>Insured</th><td colspan="3">Sunspire Retail Private Limited</td></tr>
         <tr><th>Risk Location</th><td colspan="3">No. 22, Hosur Main Road, Bengaluru, Karnataka 560029</td></tr>
         <tr><th>Occupancy</th><td>Warehouse (Storage) and Office</td>
             <th>Total Built-up Area</th><td>25,000 sq. ft.</td></tr>
       </table>
       <div class="section">Contents and Values</div>
       <table>
         <tr><th>Building and Civil Works</th><td>INR 1,10,00,000</td>
             <th>Plant and Machinery</th><td>INR 45,00,000</td></tr>
         <tr><th>Stock in Trade</th><td>INR 78,00,000</td>
             <th>Furniture and Fixtures</th><td>INR 17,00,000</td></tr>
         <tr><th>Total Sum Insured</th><td colspan="3"><b>INR 2,50,00,000</b></td></tr>
       </table>
       <div class="note">
         Values are declared by the insured and are subject to verification at the
         time of survey. This schedule forms part of the commercial property
         proposal referenced above.
       </div>
       <div class="sig">
         <div><div class="line">Authorised Signatory — Sunspire Retail Private Limited</div></div>
         <div><div class="line">For ShieldSure Insurance</div></div>
       </div>`,
      "#1F3F6E",
    ),
  },
  {
    file: "T04_site_address_electricity_bill.png",
    html: page(
      "Karnataka Power",
      `<div class="brand">
         <div>
           <div class="org">Karnataka Power Supply</div>
           <div style="font-size:13px;color:#555">Electricity Bill — Commercial Connection</div>
         </div>
         <div class="meta">
           Consumer No.: KP-560100-77213<br>
           Bill Date: 03/08/2026<br>
           Due Date: 18/08/2026
         </div>
       </div>
       <table>
         <tr><th>Consumer Name</th><td colspan="3">Sunspire Retail Private Limited</td></tr>
         <tr><th>Supply Address</th><td colspan="3">${SITE_ADDRESS}</td></tr>
         <tr><th>Connection Type</th><td>Commercial (LT-3)</td>
             <th>Sanctioned Load</th><td>45 kW</td></tr>
         <tr><th>Billing Period</th><td>01/07/2026 to 31/07/2026</td>
             <th>Units Consumed</th><td>6,420 kWh</td></tr>
         <tr><th>Amount Due</th><td colspan="3"><b>INR 58,940.00</b></td></tr>
       </table>
       <div class="note">
         This bill evidences occupancy of the supply address shown above. It is
         accepted as proof of site address for service installation.
       </div>`,
      "#0E6B45",
    ),
  },
  {
    file: "T05_site_authorization_letter.png",
    html: page(
      "Authorisation",
      `<div class="brand">
         <div>
           <div class="org">Sunspire Retail Private Limited</div>
           <div style="font-size:13px;color:#555">2nd Floor, 14 MG Road, Bengaluru, Karnataka 560001</div>
           <h1 style="margin-top:12px">Site Installation Authorisation</h1>
         </div>
         <div class="meta">
           Ref: SRPL/AUTH/2026/0084<br>
           Date: 21/05/2026
         </div>
       </div>
       <div class="note" style="font-size:14.5px;line-height:2">
         To: BharatConnect Enterprise Services<br><br>
         We confirm that <b>Sunspire Retail Private Limited</b> occupies the premises at
         <b>Plot 8, Electronic City Phase 1, Bengaluru, Karnataka 560100</b> and authorises
         BharatConnect to install, commission and maintain telecommunications equipment
         at that site in connection with service order <b>BC/ESO/2026/0825/1427</b>.<br><br>
         The undersigned is authorised to give this confirmation on behalf of the company.
       </div>
       <table>
         <tr><th>Installation Site</th><td>${SITE_ADDRESS}</td></tr>
         <tr><th>Related Service Order</th><td>BC/ESO/2026/0825/1427</td></tr>
         <tr><th>Authorised By</th><td>Arjun Mehta, Chief Operating Officer</td></tr>
       </table>
       <div class="sig">
         <div><div class="line">Arjun Mehta — Chief Operating Officer</div></div>
         <div><div class="line">Company Seal</div></div>
       </div>`,
      "#7A3E12",
    ),
  },
];

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1450, height: 480 } });

await fs.mkdir(OUT, { recursive: true });

for (const document of DOCUMENTS) {
  await tab.setContent(document.html, { waitUntil: "load" });
  await tab.screenshot({
    path: path.join(OUT, document.file),
    fullPage: true,
  });
  console.log(`generated ${document.file}`);
}

await browser.close();
