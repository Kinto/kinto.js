"use strict";

const Cu = Components.utils;

import BaseAdapter from "../src/adapters/base";
import KintoBase from "../src/KintoBase";
import FirefoxAdapter from "./FirefoxStorage";

export default function loadKinto() {
  let { EventEmitter } = Cu.import("resource://gre/modules/devtools/shared/event-emitter.js", {});

  Cu.importGlobalProperties(['fetch']);

  if (!fetch) {
    throw new Error("There was a problem loading fx-fetch");
  }

  class KintoFX extends KintoBase {
    static get adapters() {
      return {
        BaseAdapter: BaseAdapter,
        FirefoxAdapter: FirefoxAdapter
      };
    }

    constructor(options={}) {
      let emitter = {};
      EventEmitter.decorate(emitter);

      const defaults = {
        events: emitter
      };

      let expandedOptions = Object.assign(defaults, options);
      super(expandedOptions);
    }
  }

  return KintoFX;
}
