import { DataSource } from "./notion-client";

/** 前回の保存先が今も選択中のデータソースに残っていれば、その id を返す。 */
export function preferredDataSourceId(dataSources: DataSource[], id: string | undefined): string | undefined {
  if (!id) {
    return undefined;
  }
  return dataSources.some((dataSource) => dataSource.id === id) ? id : undefined;
}
