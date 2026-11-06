"use client";

import { useSyncExternalStore } from "react";
import TrashView from "../../_components/trash-view";
import { getTrash, subscribe } from "../_lib/demo-store";

export default function DemoTrashPage() {
  const items = useSyncExternalStore(subscribe, getTrash, getTrash);
  return <TrashView items={items} days={30} />;
}
