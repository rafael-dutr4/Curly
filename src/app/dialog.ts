import type { Example } from "./examples.ts";

/**
 * The two moments the application has to interrupt: choosing an example, and
 * warning that unsaved work is about to be replaced.
 *
 * Both use `<dialog>`. `window.confirm` would be shorter, but it is a browser
 * modal: it blocks the whole page, cannot be styled to match anything, and
 * reads as a warning from the browser rather than a question from the tool.
 * `<dialog>` gives focus trapping, Escape and the backdrop for free, and the
 * element is ordinary DOM the rest of the page can reason about.
 */

function open(build: (dialog: HTMLDialogElement, close: (value: unknown) => void) => void): Promise<unknown> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "curly-dialog";

    let settled = false;
    const close = (value: unknown): void => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };

    // Escape and the backdrop both fire `cancel`/`close`, and either one means
    // the same thing as pressing the safe button.
    dialog.addEventListener("close", () => close(null));
    dialog.addEventListener("cancel", () => close(null));

    build(dialog, close);
    document.body.append(dialog);
    dialog.showModal();
  });
}

/**
 * Ask before replacing the model with something else.
 *
 * The safe option is the default and the destructive one is marked, because
 * the whole reason this exists is that the previous version threw the work
 * away without asking.
 */
export async function confirmDiscard(title: string, detail: string): Promise<boolean> {
  const answer = await open((dialog, close) => {
    const heading = document.createElement("h2");
    heading.textContent = title;

    const text = document.createElement("p");
    text.textContent = detail;

    const actions = document.createElement("div");
    actions.className = "actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Keep editing";
    cancel.addEventListener("click", () => close(false));

    const discard = document.createElement("button");
    discard.type = "button";
    discard.className = "danger";
    discard.textContent = "Discard and continue";
    discard.addEventListener("click", () => close(true));

    actions.append(cancel, discard);
    dialog.append(heading, text, actions);

    // Focus the safe choice, so Enter cannot destroy anything.
    queueMicrotask(() => cancel.focus());
  });

  return answer === true;
}

/** Pick an example, or nothing when the dialog is dismissed. */
export async function chooseExample(examples: readonly Example[]): Promise<Example | null> {
  const answer = await open((dialog, close) => {
    const heading = document.createElement("h2");
    heading.textContent = "Load an example";

    const text = document.createElement("p");
    text.textContent = "Each one is a small model with its reasoning written in the comments.";

    const choices = document.createElement("div");
    choices.className = "choices";

    for (const example of examples) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice";

      const name = document.createElement("strong");
      name.textContent = example.name;

      const description = document.createElement("span");
      description.textContent = example.description;

      button.append(name, description);
      button.addEventListener("click", () => close(example));
      choices.append(button);
    }

    const actions = document.createElement("div");
    actions.className = "actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => close(null));
    actions.append(cancel);

    dialog.append(heading, text, choices, actions);
    queueMicrotask(() => (choices.firstElementChild as HTMLElement | null)?.focus());
  });

  return (answer as Example | null) ?? null;
}
