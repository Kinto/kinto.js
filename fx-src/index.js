"use strict";

const Cu = Components.utils;

import BaseAdapter from "../src/adapters/base";
import KintoBase from "../src/KintoBase";
import FirefoxAdapter from "./FirefoxStorage";

export default function loadKinto() {
  const { EventEmitter } = Cu.import("resource://gre/modules/devtools/shared/event-emitter.js", {});

  Cu.importGlobalProperties(['fetch']);

  class KintoFX extends KintoBase {
    static get adapters() {
      return {
        BaseAdapter: BaseAdapter,
        FirefoxAdapter: FirefoxAdapter
      };
    }

    constructor(options={}) {
      const emitter = {};
      EventEmitter.decorate(emitter);

      const defaults = {
        events: emitter
      };

      const expandedOptions = Object.assign(defaults, options);
      super(expandedOptions);
    }
  }

  return KintoFX;
}
