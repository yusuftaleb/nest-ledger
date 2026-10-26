import assert from "node:assert/strict";
import { test } from "node:test";
import { tidyMerchant } from "./merchant.ts";

test("statement descriptions read like names", () => {
  assert.equal(tidyMerchant("COSTCO WHOLESALE W1578 VANCOUVER BC"), "Costco Wholesale");
  assert.equal(tidyMerchant("TIM HORTONS #4521 VANCOUVER, BC"), "Tim Hortons");
  assert.equal(tidyMerchant("SAVE ON FOODS 2301 VANCOUVER BC CA"), "Save on Foods");
  assert.equal(tidyMerchant("RBC PAYMENT - THANK YOU"), "RBC Payment - Thank You");
  assert.equal(tidyMerchant("A&W 1234 VERNON BC"), "A&W");
  assert.equal(tidyMerchant("Real Canadian Superstore"), "Real Canadian Superstore");
  assert.equal(tidyMerchant("iCloud+"), "iCloud+");
  assert.equal(tidyMerchant("GST/HST CREDIT"), "GST/HST Credit");
  assert.equal(tidyMerchant("7-ELEVEN STORE 3301"), "7-Eleven");
});

test("squeezed bank lines lose the prefix, the card digits and the reference", () => {
  assert.equal(tidyMerchant("ContactlessInteracpurchase- 9373 WALMARTSTORE#"), "Walmart");
  assert.equal(tidyMerchant("WAL-MART #3042 VANCOUVER BC"), "Walmart");
  assert.equal(tidyMerchant("ContactlessInteracpurchase- 1877 REALCDNSUPERS"), "Real Canadian Superstore");
  assert.equal(tidyMerchant("ContactlessInteracpurchase- 8964 UBCOTIM HORTON"), "Tim Hortons");
  assert.equal(tidyMerchant("VisaDebitpurchase- 1874 PAYPAL*APPLE.C"), "Apple");
  assert.equal(tidyMerchant("MiscPayment Wise"), "Wise");
  assert.equal(tidyMerchant("BillPayment BELLMOBILITY"), "Bell Mobility");
  assert.equal(tidyMerchant("PayrollDeposit UBCPAYROLL"), "UBC payroll");
  assert.equal(tidyMerchant("PayrollDeposit WINNERS"), "Winners payroll");
  assert.equal(tidyMerchant("Hsn*Hsn[reference ending 7452] 800-[reference ending 3900]"), "HSN");
  assert.equal(tidyMerchant("TST-TAHINIS - 1201 VA VANCOUVER BC"), "Tahinis");
  assert.equal(tidyMerchant("APPLEBEES 123 VANCOUVER BC"), "Applebees");
});

test("transfers say who they were with", () => {
  assert.equal(tidyMerchant("e-Transfersent MariaDe Souza VLUGSN"), "e-Transfer to Maria De Souza");
  assert.equal(tidyMerchant("e-Transferreceived JamieLee CAzuAmJv"), "e-Transfer from Jamie Lee");
  assert.equal(tidyMerchant("e-Transfer- Autodeposit ALEXMORGAN"), "e-Transfer from Alexmorgan");
  assert.equal(tidyMerchant("Fundstransfercredit TTTHEOAKWOOD"), "Wire from The Oakwood");
  assert.equal(tidyMerchant("Fundstransferfee TTTHE OAKWOOD"), "Wire transfer fee");
  assert.equal(tidyMerchant("OnlineBankingtransfer-7595"), "Online banking transfer");
});
