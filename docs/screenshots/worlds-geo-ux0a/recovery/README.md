# Save and recovery browser evidence

This index covers the actual owned disposable production website, not a final UX-0A journey or owner acceptance. The current three-subject runtime art remains at revision 1 while Ember reviews the separate revised sample.

- [Independent partial save](partial-save.png): artwork saved while the geographic source remains dirty and recoverable.
- [Old-base artwork comparison](old-base-comparison.png): the retained draft is staged against a newer saved map without an automatic save.
- [Storage failure with download fallback](storage-failure-download-fallback.png): visible storage errors retain the live draft; manual download still works.
- [390px touch-browser recovery review](touch-browser-review-dialog.png): native modal bounds, reachable cancellation and no horizontal document overflow. This is emulation, not physical-phone evidence.
- [Sanitized browser proof](browser-proof.json): exact successful request identity, browser version and tested groups.

The browser harness downloads a bundle containing actual artwork/source drafts, saves only artwork, verifies the device checkpoint retains the source, closes the page without its discard handler and restores through the website. It then loses a successful geographic create response and retries the original operation; database read-back finds exactly one version with that request ID. A generation preview is rebuilt from its recipe/digest, and an accepted generation with a lost response is restored and retried to one original batch. An older artwork bundle stages comparison and deliberate rebase while retaining its content. Foreign owner/version and oversized input are rejected. Quota faults leave the live draft downloadable.

`scripts/worlds-geo-ux0a-recovery-browser.ts` is the reproducible production-browser driver. The original empty-start and schema/compatibility receipts remain in the foundation/composition indexes. All writes belong to the already owned isolated target; no shared database, deleted Earth, retained backup or private scientific bundle is used. Source/generation identities are test records, not permanent fictional canon.
