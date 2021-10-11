const { expect } = intern.getPlugin("chai");

export function fakeServerResponse(
  status: number,
  json: any,
  headers: Record<string, string> = {}
) {
  return Promise.resolve({
    status: status,
    headers: {
      get(name: string) {
        if (
          !Object.prototype.hasOwnProperty.call(headers, "Content-Length") &&
          name === "Content-Length"
        ) {
          return JSON.stringify(json).length;
        }
        return headers[name];
      },
    },
    text() {
      return Promise.resolve(JSON.stringify(json));
    },
  });
}

export function updateTitleWithDelay(record: any, str: string, delay: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ ...record, title: record.title + str });
    }, delay);
  });
}

export async function expectAsyncError<T>(
  fn: () => Promise<T>,
  message?: string | RegExp,
  baseClass: any = Error
): Promise<Error> {
  let error: Error;

  try {
    await fn();
  } catch (err: any) {
    error = err;
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
