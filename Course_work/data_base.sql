PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS SHARE_NOTES;
DROP TABLE IF EXISTS NOTES;
DROP TABLE IF EXISTS USERS;

-- USERS
CREATE TABLE USERS (
    id_user       INTEGER PRIMARY KEY AUTOINCREMENT,
    name_user     TEXT NOT NULL,
    email_user    TEXT NOT NULL UNIQUE,
    password_user TEXT NOT NULL,
    role          INTEGER NOT NULL DEFAULT 0 CHECK (role IN (0, 1)),       -- 0=user, 1=admin
    is_blocked    INTEGER NOT NULL DEFAULT 0 CHECK (is_blocked IN (0, 1)), -- 0=no, 1=yes
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- NOTES
CREATE TABLE NOTES (
    id_note       INTEGER PRIMARY KEY AUTOINCREMENT,
    id_user       INTEGER NOT NULL,
    title_note    TEXT NOT NULL,
    content_note  TEXT NOT NULL DEFAULT '',
    char_count    INTEGER NOT NULL DEFAULT 0 CHECK (char_count >= 0),
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_user) REFERENCES USERS(id_user) ON DELETE CASCADE
);

-- SHARE_NOTES
CREATE TABLE SHARE_NOTES (
    id_share_note INTEGER PRIMARY KEY AUTOINCREMENT,
    id_note       INTEGER NOT NULL,
    id_owner      INTEGER NOT NULL,
    id_share_user INTEGER NOT NULL,
    permission    INTEGER NOT NULL DEFAULT 1 CHECK (permission IN (1, 2)), -- 1=view, 2=edit

    FOREIGN KEY (id_note) REFERENCES NOTES(id_note) ON DELETE CASCADE,
    FOREIGN KEY (id_owner) REFERENCES USERS(id_user) ON DELETE CASCADE,
    FOREIGN KEY (id_share_user) REFERENCES USERS(id_user) ON DELETE CASCADE,

    CHECK (id_owner <> id_share_user),
    UNIQUE (id_note, id_share_user)
);

-- Індекси
CREATE INDEX idx_notes_id_user ON NOTES(id_user);
CREATE INDEX idx_share_notes_id_note ON SHARE_NOTES(id_note);
CREATE INDEX idx_share_notes_id_owner ON SHARE_NOTES(id_owner);
CREATE INDEX idx_share_notes_id_share_user ON SHARE_NOTES(id_share_user);
