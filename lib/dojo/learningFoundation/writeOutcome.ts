import { AsyncLocalStorage } from "node:async_hooks";

// Request bookkeeping only. Mutual exclusion remains the shared filesystem lock.
export type WriteOutcome = {
  sent: number;
  confirmed: number;
  rejected: number;
  unresolved: number;
};
export const learningWriteOutcome = new AsyncLocalStorage<WriteOutcome>();

// Call at SDK mutation dispatch, after application validation/client setup.
// SDK-local errors without explicit evidence remain conservatively unresolved.
// A rejected promise alone does not prove the remote mutation was rejected.
export async function trackLearningWrite<T>(
  send: () => Promise<T>,
  confirmedRejection: (error: unknown) => boolean = () => false,
): Promise<T> {
  const outcome = learningWriteOutcome.getStore();
  if (!outcome) return send();
  if (outcome.unresolved) throw new Error("已有結果不明的寫入，拒絕繼續派送");
  outcome.sent++;
  outcome.unresolved++;
  try {
    const result = await send();
    outcome.confirmed++;
    outcome.unresolved--;
    return result;
  } catch (error) {
    if (confirmedRejection(error)) {
      outcome.rejected++;
      outcome.unresolved--;
    }
    throw error;
  }
}

// Wrap only SDK mutation methods; retrieval remains outside write tracking.
export function trackLearningClient<T extends object>(
  client: T,
  confirmedRejection: (error: unknown) => boolean = () => false,
): T {
  if (!learningWriteOutcome.getStore()) return client;
  const wrap = (value: object, path: string): object =>
    new Proxy(value, {
      get(target, property, receiver) {
        const member = Reflect.get(target, property, receiver);
        const name = path ? `${path}.${String(property)}` : String(property);
        if (typeof member === "function") {
          if (
            [
              "pages.create",
              "pages.update",
              "blocks.update",
              "blocks.delete",
              "blocks.children.append",
            ].includes(name)
          )
            return (...args: unknown[]) =>
              trackLearningWrite(
                () => member.apply(target, args),
                confirmedRejection,
              );
          return member.bind(target);
        }
        if (
          member &&
          typeof member === "object" &&
          ["pages", "blocks", "blocks.children"].includes(name)
        )
          return wrap(member, name);
        return member;
      },
    });
  return wrap(client, "") as T;
}
