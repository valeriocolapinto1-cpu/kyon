-- Full-text search on chat messages (FTS5, external content: the text is stored once, in
-- chat_message). Diacritics are ignored ("perche" finds "perché"). Kept in sync by triggers;
-- deleted messages have an empty body, so they drop out of the index.
CREATE VIRTUAL TABLE `chat_message_fts` USING fts5(
  body,
  content='chat_message',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `chat_message_fts_insert` AFTER INSERT ON `chat_message` BEGIN
  INSERT INTO `chat_message_fts`(rowid, body) VALUES (new.rowid, new.body);
END;
--> statement-breakpoint
CREATE TRIGGER `chat_message_fts_delete` AFTER DELETE ON `chat_message` BEGIN
  INSERT INTO `chat_message_fts`(`chat_message_fts`, rowid, body) VALUES ('delete', old.rowid, old.body);
END;
--> statement-breakpoint
CREATE TRIGGER `chat_message_fts_update` AFTER UPDATE OF `body` ON `chat_message` BEGIN
  INSERT INTO `chat_message_fts`(`chat_message_fts`, rowid, body) VALUES ('delete', old.rowid, old.body);
  INSERT INTO `chat_message_fts`(rowid, body) VALUES (new.rowid, new.body);
END;
