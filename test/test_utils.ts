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
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({ ...record, title: record.title + str });
    }, delay);
  });
}
