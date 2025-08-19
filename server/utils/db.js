"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertImage = upsertImage;
exports.listImages = listImages;
exports.getImageById = getImageById;
exports.loadImagesMap = loadImagesMap;
exports.markDeleted = markDeleted;
exports.setMeta = setMeta;
exports.getMeta = getMeta;
exports.getDb = getDb;
exports.getTagsForImage = getTagsForImage;
exports.listAllTags = listAllTags;
exports.ensureTag = ensureTag;
exports.setTagsForImage = setTagsForImage;
var better_sqlite3_1 = require("better-sqlite3");
var fs = require("node:fs");
var path = require("node:path");
var dbPath = path.join(process.cwd(), "data", "meta.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
var db = new better_sqlite3_1.default(dbPath);
// スキーマ初期化/追加 (idempotent)
db.exec("\nPRAGMA journal_mode = WAL;\nCREATE TABLE IF NOT EXISTS images (\n  id INTEGER PRIMARY KEY,\n  rel_path TEXT UNIQUE,\n  filename TEXT,\n  ext TEXT,\n  mtime INTEGER,\n  size INTEGER,\n  width INTEGER,\n  height INTEGER\n);\nCREATE TABLE IF NOT EXISTS tags (\n  id INTEGER PRIMARY KEY,\n  name TEXT UNIQUE\n);\nCREATE TABLE IF NOT EXISTS image_tags (\n  image_id INTEGER,\n  tag_id INTEGER,\n  PRIMARY KEY(image_id, tag_id)\n);\nCREATE TABLE IF NOT EXISTS meta (\n  key TEXT PRIMARY KEY,\n  value TEXT\n);\n");
// 既存 DB に deleted カラムが無ければ追加
var cols = db.prepare("PRAGMA table_info(images)").all();
if (!cols.find(function (c) { return c.name === "deleted"; })) {
    db.exec("ALTER TABLE images ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0");
}
// インデックス (存在しない場合エラーにならない書式ないため例外握り)
try {
    db.exec("CREATE INDEX images_rel_path_idx ON images(rel_path)");
}
catch (_a) { }
try {
    db.exec("CREATE INDEX images_mtime_idx ON images(mtime)");
}
catch (_b) { }
try {
    db.exec("CREATE INDEX images_deleted_idx ON images(deleted)");
}
catch (_c) { }
function upsertImage(meta) {
    db.prepare("\n    INSERT INTO images (rel_path, filename, ext, mtime, size, width, height, deleted)\n    VALUES (@rel_path,@filename,@ext,@mtime,@size,@width,@height,0)\n    ON CONFLICT(rel_path) DO UPDATE SET\n      mtime=excluded.mtime,\n      size=excluded.size,\n      width=excluded.width,\n      height=excluded.height,\n      deleted=0\n  ").run(meta);
}
function listImages(offset, limit) {
    return db
        .prepare("\n    SELECT id, rel_path, filename, width, height\n    FROM images\n    WHERE deleted=0\n    ORDER BY id DESC\n    LIMIT ? OFFSET ?\n  ")
        .all(limit, offset);
}
function getImageById(id) {
    return db.prepare("SELECT * FROM images WHERE id=? AND deleted=0").get(id);
}
function loadImagesMap() {
    var rows = db
        .prepare("SELECT id, rel_path, mtime, size FROM images")
        .all();
    var map = {};
    for (var _i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
        var r = rows_1[_i];
        map[r.rel_path] = { id: r.id, mtime: r.mtime, size: r.size };
    }
    return map;
}
function markDeleted(relPaths) {
    if (!relPaths.length)
        return;
    var stmt = db.prepare("UPDATE images SET deleted=1 WHERE rel_path = ?");
    var tx = db.transaction(function (arr) {
        for (var _i = 0, arr_1 = arr; _i < arr_1.length; _i++) {
            var p = arr_1[_i];
            stmt.run(p);
        }
    });
    tx(relPaths);
}
function setMeta(key, value) {
    db.prepare("INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
}
function getMeta(key) {
    var row = db.prepare("SELECT value FROM meta WHERE key=?").get(key);
    return row === null || row === void 0 ? void 0 : row.value;
}
function getDb() {
    return db;
}
function getTagsForImage(imageId) {
    return getDb()
        .prepare("SELECT t.id, t.name FROM image_tags it JOIN tags t ON t.id=it.tag_id WHERE it.image_id=?")
        .all(imageId);
}
function listAllTags() {
    return getDb()
        .prepare("SELECT id, name, (SELECT COUNT(*) FROM image_tags it WHERE it.tag_id=tags.id) AS usage_count FROM tags ORDER BY name")
        .all();
}
function ensureTag(name) {
    var stmt = getDb().prepare("INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING");
    try {
        stmt.run(name);
    }
    catch (_a) { }
    return getDb().prepare("SELECT id FROM tags WHERE name=?").get(name);
}
function setTagsForImage(imageId, tagNames) {
    var db = getDb();
    var ids = tagNames.map(function (n) { return ensureTag(n.trim()).id; });
    var tx = db.transaction(function (newIds) {
        db.prepare("DELETE FROM image_tags WHERE image_id=?").run(imageId);
        var ins = db.prepare("INSERT INTO image_tags (image_id, tag_id) VALUES (?,?)");
        for (var _i = 0, newIds_1 = newIds; _i < newIds_1.length; _i++) {
            var id = newIds_1[_i];
            ins.run(imageId, id);
        }
    });
    tx(ids);
}
