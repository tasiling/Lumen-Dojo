import {
  applyEdit,
  assertGraph,
  FOUNDATION_PREFIX,
  LearningError,
  missingSeeds,
  SEEDS,
  type EntityInput,
  type EntityKind,
  type LearningEntity,
} from "./model";
import { CURRICULUM, plannedStages } from "./curriculum";
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
    curriculumKey?: string,
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
        ...(curriculumKey ? { curriculumKey } : {}),
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
  async function initializeItems(entities: LearningEntity[], useCurriculum = false) {
    const created: string[] = [];
    const conflicts: string[] = [];
    for (const seed of missingSeeds(entities)) {
      if (entities.some(entity => entity.kind === "item" && entity.name === seed.name)) {
        conflicts.push(seed.name + " 有未對照的同名項目，保留原項目。");
        continue;
      }
      const existingVision = seed.legacyKey ? await repository.legacyVision(seed.legacyKey) : null;
      const plan = useCurriculum ? CURRICULUM[seed.key] : undefined;
      const entity = await createEntity("item", {
        name: seed.name,
        description: seed.description,
        vision: existingVision ?? seed.vision,
        ...(plan ? { goal: plan.goal, expectedOutcome: plan.expectedOutcome } : {}),
      }, null, entities, seed.key, seed.legacyKey);
      entities.push(entity);
      created.push(entity.id);
    }
    return { created, conflicts };
  }

  return {
    snapshot,
    initialize: () =>
      repository.exclusive(async () => {
        const { entities } = await rows();
        const { created, conflicts } = await initializeItems(entities);
        return {
          entities,
          missing: missingSeeds(entities),
          created,
          conflicts,
        };
      }),
    installCurriculum: () => repository.exclusive(async () => {
      const { entities } = await rows();
      const { created, conflicts } = await initializeItems(entities, true);
      const items = entities.filter(entity => entity.kind === "item" && entity.status !== "archived");
      async function ensure(kind: "stage" | "topic", item: LearningEntity, key: string, input: EntityInput) {
        const matches = entities.filter(entity => entity.kind === kind && entity.itemId === item.id
          && (entity.curriculumKey === key || (entity.name === input.name && (kind === "stage" || entity.stageId === input.stageId))));
        if (matches.length > 1) {
          conflicts.push(item.name + "有重複的「" + input.name + "」，請在管理頁查看。");
          return null;
        }
        if (matches[0]) return matches[0];
        const entity = await createEntity(kind, input, item.id, entities, null, null, key);
        entities.push(entity);
        created.push(entity.id);
        return entity;
      }
      for (const item of items) {
        const sameNameSeed = SEEDS.find(seed => seed.name === item.name
          && items.filter(entity => entity.name === item.name).length === 1
          && !items.some(entity => entity.seedKey === seed.key || (seed.legacyKey && entity.legacyKey === seed.legacyKey)));
        const key = item.seedKey ?? item.legacyKey ?? sameNameSeed?.key;
        if (!key) continue;
        for (const route of plannedStages(key)) {
          const stage = await ensure("stage", item, route.key, { name: route.name });
          if (!stage || stage.status === "archived") continue;
          for (const topic of route.topics) {
            await ensure("topic", item, topic.key, {
              stageId: stage.id,
              name: topic.name,
              description: topic.description,
              expectedOutcome: topic.expectedOutcome,
            });
          }
        }
      }
      return { entities, missing: missingSeeds(entities), created, conflicts };
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
