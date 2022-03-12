import sinon from "sinon";

const { expect } = intern.getPlugin("chai");

export function fakeHeaders(headers: { [key: string]: string | number } = {}) {
  const h = new Headers();
  Object.entries(headers).forEach(([k, v]) => h.set(k, v.toString()));
  return h;
}

export function fakeServerResponse(
  status: number,
  json: any,
  headers: { [key: string]: string | number } = {}
) {
  const respHeaders = fakeHeaders(headers);
  if (!respHeaders.has("Content-Length")) {
    respHeaders.set("Content-Length", JSON.stringify(json).length.toString());
  }
  return Promise.resolve({
    status: status,
    statusText: status === 200 ? "OK" : "Error",
    headers: respHeaders,
    text() {
      return Promise.resolve(JSON.stringify(json));
    },
  });
}

export function delayedPromise(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}

export type Stub<T extends (...args: any[]) => any> = sinon.SinonStub<
  Parameters<T>,
  ReturnType<T>
>;

export type Spy<T extends (...args: any[]) => any> = sinon.SinonSpy<
  Parameters<T>,
  ReturnType<T>
>;

export async function expectAsyncError<T>(
  fn: () => Promise<T>,
  message?: string | RegExp,
  baseClass: any = Error
): Promise<Error> {
  let error: Error;

  try {
    await fn();
  } catch (err) {
    error = err as Error;
  }

  expect(error!).not.to.be.undefined;
  expect(error!).to.be.instanceOf(baseClass);
  if (message) {
    if (typeof message === "string") {
      expect(error!).to.have.property("message").equal(message);
    } else {
      expect(error!).to.have.property("message").match(message);
    }
  }

  return error!;
}

export function btoa(str: string): string {
  if (globalThis.btoa) {
    return globalThis.btoa(str);
  }

  return Buffer.from(str, "binary").toString("base64");
}
