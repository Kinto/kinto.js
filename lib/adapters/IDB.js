"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x3, _x4, _x5) { var _again = true; _function: while (_again) { var object = _x3, property = _x4, receiver = _x5; desc = parent = getter = undefined; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x3 = parent; _x4 = property; _x5 = receiver; _again = true; continue _function; } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _baseJs = require("./base.js");

var _baseJs2 = _interopRequireDefault(_baseJs);

var _utils = require("./../utils");

(0, _utils.attachFakeIDBSymbolsTo)(typeof global === "object" ? global : window);

var IDB = (function (_BaseAdapter) {
  _inherits(IDB, _BaseAdapter);

  function IDB(dbname) {
    _classCallCheck(this, IDB);

    _get(Object.getPrototypeOf(IDB.prototype), "constructor", this).call(this);
    this._db = null;
    // public properties
    this.dbname = dbname;
  }

  _createClass(IDB, [{
    key: "_handleError",
    value: function _handleError(method) {
      return function (err) {
        var error = new Error(method + "() " + err.message);
        error.stack = err.stack;
        throw error;
      };
    }

    /**
     * Ensures a connection to the IndexedDB database has been opened.
     *
     * @return {Promise}
     */
  }, {
    key: "open",
    value: function open() {
      var _this = this;

      if (this._db) return Promise.resolve(this);
      return new Promise(function (resolve, reject) {
        var request = indexedDB.open(_this.dbname, 1);
        request.onupgradeneeded = function (event) {
          // DB object
          var db = event.target.result;
          // Main collection store
          var collStore = db.createObjectStore(_this.dbname, {
            keyPath: "id"
          });
          // Primary key (UUID)
          collStore.createIndex("id", "id", { unique: true });
          // Local record status ("synced", "created", "updated", "deleted")
          collStore.createIndex("_status", "_status");
          // Last modified field
          collStore.createIndex("last_modified", "last_modified");

          // Metadata store
          var metaStore = db.createObjectStore("__meta__", {
            keyPath: "name"
          });
          metaStore.createIndex("name", "name", { unique: true });
        };
        request.onerror = function (event) {
          return reject(event.target.error);
        };
        request.onsuccess = function (event) {
          _this._db = event.target.result;
          resolve(_this);
        };
      });
    }

    /**
     * Returns a transaction and a store objects for this collection.
     *
     * To determine if a transaction has completed successfully, we should rather
     * listen to the transaction’s complete event rather than the IDBObjectStore
     * request’s success event, because the transaction may still fail after the
     * success event fires.
     *
     * @param {String}      mode  Transaction mode ("readwrite" or undefined)
     * @param {String|null} name  Store name (defaults to coll name)
     */
  }, {
    key: "prepare",
    value: function prepare() {
      var mode = arguments.length <= 0 || arguments[0] === undefined ? undefined : arguments[0];
      var name = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];

      var storeName = name || this.dbname;
      var transaction = this._db.transaction([storeName], mode);
      var store = transaction.objectStore(storeName);
      return { transaction: transaction, store: store };
    }

    /**
     * Deletes every records in the current collection.
     *
     * @return {Promise}
     */
  }, {
    key: "clear",
    value: function clear() {
      var _this2 = this;

      return this.open().then(function () {
        return new Promise(function (resolve, reject) {
          var _prepare = _this2.prepare("readwrite");

          var transaction = _prepare.transaction;
          var store = _prepare.store;

          store.clear();
          transaction.onerror = function (event) {
            return reject(new Error(event.target.error));
          };
          transaction.oncomplete = function () {
            return resolve();
          };
        });
      })["catch"](this._handleError("clear"));
    }

    /**
     * Adds a record to the IndexedDB database.
     *
     * Note: An id value is required.
     *
     * @param  {Object} record The record object, including an id.
     * @return {Promise}
     */
  }, {
    key: "create",
    value: function create(record) {
      var _this3 = this;

      return this.open().then(function () {
        return new Promise(function (resolve, reject) {
          var _prepare2 = _this3.prepare("readwrite");

          var transaction = _prepare2.transaction;
          var store = _prepare2.store;

          store.add(record);
          transaction.onerror = function (event) {
            return reject(new Error(event.target.error));
          };
          transaction.oncomplete = function () {
            return resolve(record);
          };
        });
      })["catch"](this._handleError("create"));
    }

    /**
     * Updates a record from the IndexedDB database.
     *
     * @param  {Object} record
     * @return {Promise}
     */
  }, {
    key: "update",
    value: function update(record) {
      var _this4 = this;

      return this.open().then(function () {
        return new Promise(function (resolve, reject) {
          var _prepare3 = _this4.prepare("readwrite");

          var transaction = _prepare3.transaction;
          var store = _prepare3.store;

          var request = store.put(record);
          transaction.onerror = function (event) {
            return reject(new Error(event.target.error));
          };
          transaction.oncomplete = function () {
            return resolve(record);
          };
        });
      })["catch"](this._handleError("update"));
    }

    /**
     * Retrieve a record by its primary key from the IndexedDB database.
     *
     * @param  {String} id The record id.
     * @return {Promise}
     */
  }, {
    key: "get",
    value: function get(id) {
      var _this5 = this;

      return this.open().then(function () {
        return new Promise(function (resolve, reject) {
          var _prepare4 = _this5.prepare();

          var transaction = _prepare4.transaction;
          var store = _prepare4.store;

          var request = store.get(id);
          transaction.onerror = function (event) {
            return reject(new Error(event.target.error));
          };
          transaction.oncomplete = function () {
            return resolve(request.result);
          };
        });
      })["catch"](this._handleError("get"));
    }

    /**
     * Deletes a record from the IndexedDB database.
     *
     * @param  {String} id The record id.
     * @return {Promise}
     */
  }, {
    key: "delete",
    value: function _delete(id) {
      var _this6 = this;

      return this.open().then(function () {
        return new Promise(function (resolve, reject) {
          var _prepare5 = _this6.prepare("readwrite");

          var transaction = _prepare5.transaction;
          var store = _prepare5.store;

          store["delete"](id);
          transaction.onerror = function (event) {
            return reject(new Error(event.target.error));
          };
          transaction.oncomplete = function () {
            return resolve(id);
          };
        });
      })["catch"](this._handleError("delete"));
    }

    /**
     * Lists all records from the IndexedDB database.
     *
     * @return {Promise}
     */
  }, {
    key: "list",
    value: function list() {
      var _this7 = this;

      return this.open().then(function () {
        return new Promise(function (resolve, reject) {
          var results = [];

          var _prepare6 = _this7.prepare();

          var transaction = _prepare6.transaction;
          var store = _prepare6.store;

          var request = store.openCursor();
          request.onsuccess = function (event) {
            var cursor = event.target.result;
            if (cursor) {
              results.push(cursor.value);
              cursor["continue"]();
            }
          };
          transaction.onerror = function (event) {
            return reject(new Error(event.target.error));
          };
          transaction.oncomplete = function (event) {
            return resolve(results);
          };
        });
      })["catch"](this._handleError("list"));
    }

    /**
     * Store the lastModified value into metadata store.
     *
     * @param  {Number}  lastModified
     * @param  {Object}  options
     * @return {Promise}
     */
  }, {
    key: "saveLastModified",
    value: function saveLastModified(lastModified) {
      var _this8 = this;

      var value = parseInt(lastModified, 10);
      return this.open().then(function () {
        return new Promise(function (resolve, reject) {
          var _prepare7 = _this8.prepare("readwrite", "__meta__");

          var transaction = _prepare7.transaction;
          var store = _prepare7.store;

          var request = store.put({ name: "lastModified", value: value });
          transaction.onerror = function (event) {
            return reject(event.target.error);
          };
          transaction.oncomplete = function (event) {
            return resolve(value);
          };
        });
      });
    }

    /**
     * Retrieve saved lastModified value.
     *
     * @return {Promise}
     */
  }, {
    key: "getLastModified",
    value: function getLastModified() {
      var _this9 = this;

      return this.open().then(function () {
        return new Promise(function (resolve, reject) {
          var _prepare8 = _this9.prepare(undefined, "__meta__");

          var transaction = _prepare8.transaction;
          var store = _prepare8.store;

          var request = store.get("lastModified");
          transaction.onerror = function (event) {
            return reject(event.target.error);
          };
          transaction.oncomplete = function (event) {
            resolve(request.result && request.result.value || null);
          };
        });
      });
    }
  }]);

  return IDB;
})(_baseJs2["default"]);

exports["default"] = IDB;
module.exports = exports["default"];