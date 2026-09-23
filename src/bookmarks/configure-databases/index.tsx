import {
  Action,
  ActionPanel,
  Form,
  Icon,
  Toast,
  getPreferenceValues,
  openExtensionPreferences,
  showToast,
} from "@raycast/api";
import { showFailureToast, usePromise } from "@raycast/utils";
import { DataSource } from "../../lib/notion-client";
import { listAccessibleDataSources } from "../data-sources";
import { loadSelectedDataSources, saveSelectedDataSources } from "../storage";

type FormValues = Record<string, boolean>;

export default function ConfigureBookmarkDatabases() {
  const token = getPreferenceValues<Preferences>().notionToken.trim();
  const { data, isLoading, error, revalidate } = usePromise(loadFormData, [token]);
  const dataSources = data?.dataSources ?? [];
  const selectedIds = new Set(data?.selected.map((item) => item.id) ?? []);

  async function save(values: FormValues) {
    if (isLoading || error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Databases are not loaded yet",
        message: error?.message,
      });
      return;
    }

    try {
      const selected = dataSources.filter((dataSource) => values[dataSource.id]);
      await saveSelectedDataSources(selected);
      await showToast({
        style: Toast.Style.Success,
        title: "Databases saved",
        message: `${selected.length} selected`,
      });
    } catch (saveError) {
      await showFailureToast(saveError, { title: "Could not save databases" });
    }
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Databases" icon={Icon.Check} onSubmit={save} />
          <Action title="Reload Databases" icon={Icon.ArrowClockwise} onAction={() => revalidate()} />
          <Action title="Open Extension Preferences" icon={Icon.Key} onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    >
      {error ? <Form.Description text={error.message} /> : null}
      {!error && !isLoading && dataSources.length === 0 ? (
        <Form.Description text="No databases with a URL property are visible to this token. Check the token's access and URL properties, then reload." />
      ) : null}
      {!error && dataSources.length > 0 ? (
        <Form.Description text="Choose which databases Search Bookmarks and Save Bookmark should use. Only databases with a URL property are listed." />
      ) : null}
      {dataSources.map((dataSource, index) => (
        <Form.Checkbox
          key={dataSource.id}
          id={dataSource.id}
          title={index === 0 ? "Databases" : ""}
          label={dataSource.title}
          defaultValue={selectedIds.has(dataSource.id)}
        />
      ))}
    </Form>
  );
}

async function loadFormData(token: string): Promise<{ dataSources: DataSource[]; selected: DataSource[] }> {
  const [dataSources, selected] = await Promise.all([listAccessibleDataSources(token), loadSelectedDataSources()]);
  return { dataSources, selected };
}
