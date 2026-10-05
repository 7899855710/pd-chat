# PD Chat – updated setup

## What changed in this build
- WhatsApp-style group creation with searchable participant picker and selected-member chips.
- Group info screen with add/remove participants, group admins, leave group and permissions for editing info, sending messages and adding participants.
- Dynamic message bubbles: short messages stay short; long messages wrap naturally.
- Existing account approval, blocking, admin controls, calls and profiles are preserved.
- Readable/plaintext passwords are no longer stored by PD Chat. Use Firebase password reset for recovery.

## Firebase
Publish `firestore.rules` before testing the new group permissions. Test with two normal users and one admin.

## Local/LAN testing
Ubuntu can serve this folder with:

    python3 local_server.py

Then open `http://SERVER-IP:8000` from another PC on the same LAN.

`local_server.py` uses only the Python standard library and creates a `local_data/` folder containing JSON state/event files. It is the local event-store foundation for offline mode. The current browser app still uses Firebase for its live data path; full bidirectional Firebase/local synchronization should be enabled only after the local event schema is tested, to avoid corrupting production chats.
