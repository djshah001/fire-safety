// User-supplied BOQ.xlsx, sheet 1, rows 69–78. Editable revision defaults.
export const quotationDefaults = {
  validityDays: 7,
  exclusions: `1. GST: 18% Goods & Services Tax will be charged extra, as applicable.
2. Quotation Validity: This quotation is valid for 7 days from the date of issue.
3. Civil Works: Any civil work, including excavation, pedestal construction, RCC road cutting, and backfilling, is not included unless specifically agreed.
4. Cabling: Supply of cabling from main source (GEB/Generator) to our panel is in your scope.
5. Documentation Charges: Any legal or statutory fees for approvals, NOC, or related documentation are in your scope.
6. Installation Works: Piping and cabling will be invoiced based on actual installation executed.
8. NOC Charges: AMC and NOC consultancy charges amounting to 50,000 shall be paid in extra. This amount is not included in the above BOQ and will be charged separately.
9. Site Utilities: Necessary provisions like water and electricity for work or testing to be provided by the client.
10. Invoicing: Invoices will be prepared based on actual measurements. Final invoice will be submitted after full payment is received.`,
  deliveryTerms: 'Delivery and installation schedule to be agreed with the customer.',
  paymentTerms: `7. Payment Terms:
50% advance with Work Order
30% after materials reach your site
15% upon completion of installation
5% after final testing and issuance of NOC`,
};
