import {
  applyEdit,
  assertGraph,
  FOUNDATION_PREFIX,
  LearningError,
  missingSeeds,
  type EntityInput,
  type EntityKind,
  type LearningEntity,
} from "./model";
export type RecordRow = { id: string; title: string; value: unknown };
export type FoundationRepository = {
  owner: string;
  list(): Promise<RecordRow[]>;
  create(title: string, entity: LearningEntity): Promise<void>;
  update(rowId: string, title: string, entity: LearningEntity): Promise<void>;
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
  legacyVision(key: string): Promise<string | null>;
};
export function foundationService(repository: FoundationRepository) {
  async function rows() {
    const all = await repository.list();
    const entities = all.map((row) => row.value as LearningEntity);
    assertGraph(entities, repository.owner);
    if (
      all.some(
        (row, i) => row.title !== `${FOUNDATION_PREFIX}${entities[i].id}`,
      )
    )
      throw new LearningError("學習資料標題與識別不符", 409);
    return { all, entities };
  }
  async function snapshot() {
    const { entities } = await rows();
    return { entities, missing: missingSeeds(entities) };
  }
  async function createEntity(
    kind: EntityKind,
    input: EntityInput,
    itemId: string | null,
    entities: LearningEntity[],
    seedKey: string | null = null,
    legacyKey: LearningEntity["legacyKey"] = null,
  ) {
    if (!["item", "stage", "topic"].includes(kind))
      throw new LearningError("學習資料類型不正確");
    if (
      kind !== "item" &&
      !entities.some(
        (e) => e.kind === "item" && e.id === itemId && e.status !== "archived",
      )
    )
      throw new LearningError("找不到可管理的學習項目", 403);
    const now = new Date().toISOString();
    const entity = applyEdit(
      {
        schema: 1,
        id: crypto.randomUUID(),
        owner: repository.owner,
        kind,
        itemId: kind === "item" ? null : itemId,
        stageId: null,
        legacyKey,
        seedKey,
        name: "",
        description: "",
        vision: "",
        goal: "",
        expectedOutcome: "",
        order:
          entities.filter((e) => e.kind === kind && e.itemId === itemId)
            .length * 10,
        status: "active",
        focused: false,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      },
      input,
      entities,
      now,
    );
    assertGraph([...entities, entity], repository.owner);
    await repository.create(`${FOUNDATION_PREFIX}${entity.id}`, entity);
    return entity;
  }
  return {
    snapshot,
    initialize: () =>
      repository.exclusive(async () => {
        const { entities } = await rows();
        const created: string[] = [];
        const conflicts: string[] = [];
        // Sequential independent records: partial failure is visible and retry discovers committed seed keys.
        for (const seed of missingSeeds(entities)) {
          if (entities.some((e) => e.kind === "item" && e.name === seed.name)) {
            conflicts.push(
              `${seed.name} 有未對照的同名項目，請先改名或人工確認；未自動建立或覆蓋`,
            );
            continue;
          }
          const existingVision = seed.legacyKey
            ? await repository.legacyVision(seed.legacyKey)
            : null;
          const entity = await createEntity(
            "item",
            {
              name: seed.name,
              description: seed.description,
              vision: existingVision ?? seed.vision,
            },
            null,
            entities,
            seed.key,
            seed.legacyKey,
          );
          entities.push(entity);
          created.push(entity.id);
        }
        return {
          entities,
          missing: missingSeeds(entities),
          created,
          conflicts,
        };
      }),
    create: (kind: EntityKind, input: EntityInput, itemId: string | null) =>
      repository.exclusive(async () => {
        const { entities } = await rows();
        return createEntity(kind, input, itemId, entities);
      }),
    edit: (id: string, revision: number, input: EntityInput) =>
      repository.exclusive(async () => {
        const { all, entities } = await rows();
        const index = entities.findIndex((e) => e.id === id);
        if (index < 0)
          throw new LearningError("找不到屬於本擁有者的學習資料", 403);
        const entity = entities[index];
        if (!Number.isInteger(revision) || revision !== entity.revision)
          throw new LearningError("資料版本已變更，請重新讀取再編輯", 409);
        const updated = applyEdit(
          entity,
          input,
          entities,
          new Date().toISOString(),
        );
        assertGraph(
          entities.map((e) => (e.id === id ? updated : e)),
          repository.owner,
        );
        await repository.update(all[index].id, all[index].title, updated);
        return updated;
      }),
  };
}
