/* eslint-disable prefer-const */
import { App, Component, MarkdownRenderer } from "obsidian";
import { type Literal } from "obsidian-dataview";
// import { DataArray } from "src/data-model/data-array";

import type { QuerySettings } from "@/settings";
import * as Values from "@/api/dataview/data-model/values";
// import { currentLocale } from "util/locale";
// import { renderMinimalDate, renderMinimalDuration } from "util/normalize";
import * as Widgets from "@/api/dataview/data-model/widgets";
import { currentLocale } from "@/utils/locale";
import { renderMinimalDate, renderMinimalDuration } from "@/utils/normalize";

export type ValueRenderContext = "root" | "list";

/** Render simple fields compactly, removing wrapping content like paragraph and span. */
export async function renderCompactMarkdown(
	app: App,
	markdown: string,
	container: HTMLElement,
	sourcePath: string,
	component: Component,
	isInlineFieldLivePreview: boolean = false
) {
	// check if the call is from the CM6 view plugin defined in src/ui/views/inline-field-live-preview.ts
	if (isInlineFieldLivePreview) {
		await renderCompactMarkdownForInlineFieldLivePreview(
			app,
			markdown,
			container,
			sourcePath,
			component
		);
	} else {
		let subcontainer = container.createSpan();
		await MarkdownRenderer.render(
			app,
			markdown,
			subcontainer,
			sourcePath,
			component
		);

		let paragraph = subcontainer.querySelector(":scope > p");
		if (subcontainer.children.length == 1 && paragraph) {
			while (paragraph.firstChild) {
				subcontainer.appendChild(paragraph.firstChild);
			}
			subcontainer.removeChild(paragraph);
		}
	}
}

async function renderCompactMarkdownForInlineFieldLivePreview(
	app: App,
	markdown: string,
	container: HTMLElement,
	sourcePath: string,
	component: Component
) {
	const tmpContainer = createSpan();
	await MarkdownRenderer.render(
		app,
		markdown,
		tmpContainer,
		sourcePath,
		component
	);

	let paragraph = tmpContainer.querySelector(":scope > p");
	if (tmpContainer.childNodes.length == 1 && paragraph) {
		container.replaceChildren(...Array.from(paragraph.childNodes));
	} else {
		container.replaceChildren(...Array.from(tmpContainer.childNodes));
	}

	tmpContainer.remove();
}

/** Prettily render a value into a container with the given settings. */
export async function renderValue(
	app: App,
	field: Literal,
	container: HTMLElement,
	originFile: string,
	component: Component,
	settings: QuerySettings,
	expandList: boolean = false,
	context: ValueRenderContext = "root",
	depth: number = 0,
	isInlineFieldLivePreview: boolean = false
) {
	// Prevent infinite recursion.
	if (depth > settings.maxRecursiveRenderDepth) {
		container.appendText("...");
		return;
	}

	if (Values.isNull(field)) {
		await renderCompactMarkdown(
			app,
			settings.renderNullAs,
			container,
			originFile,
			component,
			isInlineFieldLivePreview
		);
	} else if (Values.isDate(field)) {
		container.appendText(
			renderMinimalDate(field, settings, currentLocale())
		);
	} else if (Values.isDuration(field)) {
		container.appendText(renderMinimalDuration(field));
	} else if (
		Values.isString(field) ||
		Values.isBoolean(field) ||
		Values.isNumber(field)
	) {
		await renderCompactMarkdown(
			app,
			"" + field,
			container,
			originFile,
			component,
			isInlineFieldLivePreview
		);
	}
	// else if (Values.isLink(field)) {
	// 	await renderCompactMarkdown(
	// 		app,
	// 		field.markdown(),
	// 		container,
	// 		originFile,
	// 		component,
	// 		isInlineFieldLivePreview
	// 	);
	// }
	else if (Values.isHtml(field)) {
		container.appendChild(field);
	} else if (Values.isWidget(field)) {
		if (Widgets.isListPair(field)) {
			await renderValue(
				app,
				field.key,
				container,
				originFile,
				component,
				settings,
				expandList,
				context,
				depth,
				isInlineFieldLivePreview
			);
			container.appendText(": ");
			await renderValue(
				app,
				field.value,
				container,
				originFile,
				component,
				settings,
				expandList,
				context,
				depth,
				isInlineFieldLivePreview
			);
		} else if (Widgets.isExternalLink(field)) {
			let elem = document.createElement("a");
			elem.textContent = field.display ?? field.url;
			elem.rel = "noopener";
			elem.target = "_blank";
			elem.classList.add("external-link");
			elem.href = field.url;
			container.appendChild(elem);
		} else {
			container.appendText(`<unknown widget '${field.$widget}>`);
		}
	} else if (Values.isFunction(field)) {
		container.appendText("<function>");
	}
	//  else if (Values.isArray(field) || DataArray.isDataArray(field)) {
	// 	if (expandList) {
	// 		let list = container.createEl("ul", {
	// 			cls: [
	// 				"dataview",
	// 				"dataview-ul",
	// 				context == "list"
	// 					? "dataview-result-list-ul"
	// 					: "dataview-result-list-root-ul",
	// 			],
	// 		});
	// 		for (let child of field) {
	// 			let li = list.createEl("li", {
	// 				cls: "dataview-result-list-li",
	// 			});
	// 			await renderValue(
	// 				app,
	// 				child,
	// 				li,
	// 				originFile,
	// 				component,
	// 				settings,
	// 				expandList,
	// 				"list",
	// 				depth + 1,
	// 				isInlineFieldLivePreview
	// 			);
	// 		}
	// 	}
	//     else {
	// 		if (field.length == 0) {
	// 			container.appendText("<empty list>");
	// 			return;
	// 		}

	// 		let span = container.createEl("span", {
	// 			cls: ["dataview", "dataview-result-list-span"],
	// 		});
	// 		let first = true;
	// 		for (let val of field) {
	// 			if (first) first = false;
	// 			else span.appendText(", ");

	// 			await renderValue(
	// 				app,
	// 				val,
	// 				span,
	// 				originFile,
	// 				component,
	// 				settings,
	// 				expandList,
	// 				"list",
	// 				depth + 1,
	// 				isInlineFieldLivePreview
	// 			);
	// 		}
	// 	}
	// }
	else if (Values.isObject(field)) {
		// Don't render classes in case they have recursive references; spoopy.
		if (field?.constructor?.name && field?.constructor?.name != "Object") {
			container.appendText(`<${field.constructor.name}>`);
			return;
		}

		if (expandList) {
			let list = container.createEl("ul", {
				cls: ["dataview", "dataview-ul", "dataview-result-object-ul"],
			});
			for (let [key, value] of Object.entries(field)) {
				let li = list.createEl("li", {
					cls: [
						"dataview",
						"dataview-li",
						"dataview-result-object-li",
					],
				});
				li.appendText(key + ": ");
				await renderValue(
					app,
					value,
					li,
					originFile,
					component,
					settings,
					expandList,
					"list",
					depth + 1,
					isInlineFieldLivePreview
				);
			}
		} else {
			if (Object.keys(field).length == 0) {
				container.appendText("<empty object>");
				return;
			}

			let span = container.createEl("span", {
				cls: ["dataview", "dataview-result-object-span"],
			});
			let first = true;
			for (let [key, value] of Object.entries(field)) {
				if (first) first = false;
				else span.appendText(", ");

				span.appendText(key + ": ");
				await renderValue(
					app,
					value,
					span,
					originFile,
					component,
					settings,
					expandList,
					"list",
					depth + 1,
					isInlineFieldLivePreview
				);
			}
		}
	} else {
		container.appendText("Unrecognized: " + JSON.stringify(field));
	}
}