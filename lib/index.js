"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

require("babel/polyfill");

require("isomorphic-fetch");

var _events = require("events");

var _api = require("./api");

var _api2 = _interopRequireDefault(_api);

var _collection = require("./collection");

var _collection2 = _interopRequireDefault(_collection);

var _adaptersBase = require("./adapters/base");

var _adaptersBase2 = _interopRequireDefault(_adaptersBase);

var _adaptersLocalStorage = require("./adapters/LocalStorage");

var _adaptersLocalStorage2 = _interopRequireDefault(_adaptersLocalStorage);

var _adaptersIDB = require("./adapters/IDB");

var _adaptersIDB2 = _interopRequireDefault(_adaptersIDB);

var DEFAULT_BUCKET_NAME = "default";

/**
 * Kinto class.
 */

var Kinto = (function () {
  _createClass(Kinto, null, [{
    key: "adapters",

    /**
     * Provides a public access to the BaseAdapter class, so that users can create
     * their DB adapter.
     * @return {BaseAdapter}
     */
    get: function get() {
      return {
        BaseAdapter: _adaptersBase2["default"],
        LocalStorage: _adaptersLocalStorage2["default"],
        IDB: _adaptersIDB2["default"]
      };
    }

    /**
     * Constructor.
     *
     * Options:
     * - {String}       bucket   The collection bucket name.
     * - {EventEmitter} events   Events handler.
     * - {BaseAdapter}  adapter  The base DB adapter class.
     * - {String}       requestMode The HTTP CORS mode to use.
     *
     * @param  {Object} options The options object.
     */
  }]);

  function Kinto() {
    var options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    _classCallCheck(this, Kinto);

    this._options = options;
    this._collections = {};
    // public properties
    this.events = options.events || new _events.EventEmitter();
  }

  /**
   * Creates or retrieve a Collection instance.
   *
   * @param  {String} collName The collection name.
   * @return {Collection}
   */

  _createClass(Kinto, [{
    key: "collection",
    value: function collection(collName) {
      if (!collName) throw new Error("missing collection name");

      var bucket = this._options.bucket || DEFAULT_BUCKET_NAME;
      var api = new _api2["default"](this._options.remote || "http://localhost:8888/v1", {
        headers: this._options.headers || {},
        events: this.events,
        requestMode: this._options.requestMode
      });

      if (!this._collections.hasOwnProperty(collName)) {
        this._collections[collName] = new _collection2["default"](bucket, collName, api, {
          events: this.events,
          adapter: this._options.adapter || Kinto.adapters.IDB
        });
      }

      return this._collections[collName];
    }
  }]);

  return Kinto;
})();

exports["default"] = Kinto;
module.exports = exports["default"];