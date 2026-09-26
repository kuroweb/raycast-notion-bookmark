import { describe, expect, it } from "vitest";
import { dataSourceOptions, preferredDataSourceId } from "../../src/lib/data-sources";

const dataSources = [
  { id: "ds-1", title: "Tech" },
  { id: "ds-2", title: "Work" },
];

describe("preferredDataSourceId", () => {
  it("選択中に残っている id ならそのまま使う", () => {
    expect(preferredDataSourceId(dataSources, "ds-2")).toBe("ds-2");
  });

  it("選択から外れた id は使わない（呼び出し側が先頭へフォールバックする）", () => {
    expect(preferredDataSourceId(dataSources, "ds-9")).toBeUndefined();
    expect(preferredDataSourceId([], "ds-1")).toBeUndefined();
  });

  it("前回の保存先がなければ undefined", () => {
    expect(preferredDataSourceId(dataSources, undefined)).toBeUndefined();
  });
});

describe("dataSourceOptions", () => {
  it("現在の保存先が選択中にあればそのまま返す", () => {
    expect(dataSourceOptions(dataSources, { id: "ds-2", title: "Work" })).toEqual(dataSources);
  });

  it("選択から外れた保存先は末尾に足して選べるようにする", () => {
    expect(dataSourceOptions(dataSources, { id: "ds-9", title: "Old" })).toEqual([
      ...dataSources,
      { id: "ds-9", title: "Old" },
    ]);
  });

  it("保存先が空なら足さない", () => {
    expect(dataSourceOptions(dataSources, { id: "", title: "" })).toEqual(dataSources);
  });
});
