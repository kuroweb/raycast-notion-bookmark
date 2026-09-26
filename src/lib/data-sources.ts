import { DataSource } from "./notion-client";

/** 前回の保存先が今も選択中のデータソースに残っていれば、その id を返す。 */
export function preferredDataSourceId(dataSources: DataSource[], id: string | undefined): string | undefined {
  if (!id) {
    return undefined;
  }
  return dataSources.some((dataSource) => dataSource.id === id) ? id : undefined;
}

/** 保存先の選択肢。現在の保存先が選択中のデータソースから外れていても選べるよう残す。 */
export function dataSourceOptions(dataSources: DataSource[], current: DataSource): DataSource[] {
  if (current.id.length === 0 || dataSources.some((dataSource) => dataSource.id === current.id)) {
    return dataSources;
  }
  return [...dataSources, current];
}
