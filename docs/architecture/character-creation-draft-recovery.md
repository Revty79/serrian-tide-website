# Character creation device drafts

Unfinished player Characters automatically retain their editor draft on the current device. **Save Character** remains the explicit database save, and **Complete Character** remains explicit. Completed Characters and NPCs do not use this creation backup.

The draft covers identity and Race, Attributes, skill allocations with exact parent/draft identities, story, inventory stacks, individual Item copies, currency and the current editor tab. A synchronous layout effect writes after each committed change; there is no debounce gap before Back or reload. The existing unload warning remains for unsaved work. Print continues to use the authorized saved record and its existing unsaved-edit confirmation.

`character-creation-autosave.ts` validates a versioned packet. Its key is scoped to the authenticated viewer, Campaign, Character and Player/manager/owner access. Each mounted editor writes its own slot so independent windows do not overwrite each other. Restoring first writes a replacement slot, then retires the old slot only if its bytes are unchanged. Successful manual saves retire only the acknowledged editor slot. Newer other-window writes survive.

A single draft based on the current saved record restores automatically. A changed saved record or several drafts presents explicit recovery choices. Unsaved Race choices are reloaded through the existing authorized Race action. Temporary identity counters resume below the recovered identities. The normal server save validation, permissions and commerce-version conflict protection remain authoritative.

Packets already matching the saved content are recognized even when a successful save assigned new Skill/Item identities. Invalid packets remain retained and are not loaded. Storage failures show an explicit warning and leave manual saving available. Browser storage is device-local and may be cleared by the browser; it does not provide account or cross-device synchronization.

Implementation: `use-character-creation-recovery.ts` and the shared `CharacterEditor`; the authorized Realms and Heavens routes supply the viewer identity. Large disposable-test receipts and captures remain ignored under `artifacts/character-creation-autosave/`.
