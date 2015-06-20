import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import wd from "wd";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

describe("Demo app", () => {
  var browser;

  before(() => {
    browser = wd.promiseChainRemote();
    var chromeBin = process.env.CHROME_BIN;
    var options = {
      browserName: "chrome",
      webStorageEnabled: true
    };
    if (chromeBin) {
      options.chrome_binary = chromeBin;
    }
    return browser.init(options);
  });

  beforeEach(() => browser.get("http://localhost:8080/"));

  after(() => browser.quit());

  it("should retrieve the page title", () => {
    return browser.title().should.become("Cliquetis demo");
  });
});
