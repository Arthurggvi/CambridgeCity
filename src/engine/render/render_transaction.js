function moveChildren(source, target) {
  const fragment = document.createDocumentFragment();
  while (source.firstChild) {
    fragment.appendChild(source.firstChild);
  }
  target.replaceChildren(fragment);
}

export function createRenderTransactionTargets() {
  const app = document.getElementById("app");
  const choices = document.getElementById("choices");

  if (!app || !choices) {
    throw new Error("render transaction targets missing");
  }

  return {
    app,
    choices,
    appDraft: document.createElement("div"),
    choicesDraft: document.createElement("div")
  };
}

export function commitRenderTransaction(targets) {
  moveChildren(targets.appDraft, targets.app);
  moveChildren(targets.choicesDraft, targets.choices);
}

export function createHostRenderTransaction(target) {
  if (!target) {
    throw new Error("render transaction host missing");
  }

  return {
    host: target,
    draft: document.createElement("div")
  };
}

export function commitHostRenderTransaction(transaction) {
  moveChildren(transaction.draft, transaction.host);
}