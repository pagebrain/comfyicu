import { app } from "./app.js";
import { ComfyDialog, $el } from "./ui.js";
import { ComfyApp } from "./app.js";
import { ComfyWidgets, addValueControlWidget } from "./widgets.js";

let id;
export class ClipspaceDialog extends ComfyDialog {
	static items = [];
	static instance = null;

	static registerButton(name, contextPredicate, callback) {
		const item =
			$el("button", {
				type: "button",
				textContent: name,
				contextPredicate: contextPredicate,
				onclick: callback
			})

		ClipspaceDialog.items.push(item);
	}

	static invalidatePreview() {
		if(ComfyApp.clipspace && ComfyApp.clipspace.imgs && ComfyApp.clipspace.imgs.length > 0) {
			const img_preview = document.getElementById("clipspace_preview");
			if(img_preview) {
				img_preview.src = ComfyApp.clipspace.imgs[ComfyApp.clipspace['selectedIndex']].src;
				img_preview.style.maxHeight = "100%";
				img_preview.style.maxWidth = "100%";
			}
		}
	}

	static invalidate() {
		if(ClipspaceDialog.instance) {
			const self = ClipspaceDialog.instance;
			// allow reconstruct controls when copying from non-image to image content.
			const children = $el("div.comfy-modal-content", [ self.createImgSettings(), ...self.createButtons() ]);

			if(self.element) {
				// update
				self.element.removeChild(self.element.firstChild);
				self.element.appendChild(children);
			}
			else {
				// new
				self.element = $el("div.comfy-modal", { parent: document.body }, [children,]);
			}

			if(self.element.children[0].children.length <= 1) {
				self.element.children[0].appendChild($el("p", {}, ["Unable to find the features to edit content of a format stored in the current Clipspace."]));
			}

			ClipspaceDialog.invalidatePreview();
		}
	}

	constructor() {
		super();
	}

	createButtons(self) {
		const buttons = [];

		for(let idx in ClipspaceDialog.items) {
			const item = ClipspaceDialog.items[idx];
			if(!item.contextPredicate || item.contextPredicate())
				buttons.push(ClipspaceDialog.items[idx]);
		}

		buttons.push(
			$el("button", {
				type: "button",
				textContent: "Close",
				onclick: () => { this.close(); }
			})
		);

		return buttons;
	}

	createImgSettings() {
		if(ComfyApp.clipspace.imgs) {
			const combo_items = [];
			const imgs = ComfyApp.clipspace.imgs;

			for(let i=0; i < imgs.length; i++) {
				combo_items.push($el("option", {value:i}, [`${i}`]));
			}

			const combo1 = $el("select",
				{id:"clipspace_img_selector", onchange:(event) => {
					ComfyApp.clipspace['selectedIndex'] = event.target.selectedIndex;
					ClipspaceDialog.invalidatePreview();
				} }, combo_items);

			const row1 =
				$el("tr", {},
						[
							$el("td", {}, [$el("font", {color:"white"}, ["Select Image"])]),
							$el("td", {}, [combo1])
						]);


			const combo2 = $el("select",
								{id:"clipspace_img_paste_mode", onchange:(event) => {
									ComfyApp.clipspace['img_paste_mode'] = event.target.value;
								} },
								[
									$el("option", {value:'selected'}, 'selected'),
									$el("option", {value:'all'}, 'all')
								]);
			combo2.value = ComfyApp.clipspace['img_paste_mode'];

			const row2 =
				$el("tr", {},
						[
							$el("td", {}, [$el("font", {color:"white"}, ["Paste Mode"])]),
							$el("td", {}, [combo2])
						]);

			const td = $el("td", {align:'center', width:'100px', height:'100px', colSpan:'2'},
								[ $el("img",{id:"clipspace_preview", ondragstart:() => false},[]) ]);

			const row3 =
				$el("tr", {}, [td]);

			return $el("table", {}, [row1, row2, row3]);
		}
		else {
			return [];
		}
	}

	createImgPreview() {
		if(ComfyApp.clipspace.imgs) {
			return $el("img",{id:"clipspace_preview", ondragstart:() => false});
		}
		else
			return [];
	}

	show() {
		const img_preview = document.getElementById("clipspace_preview");
		ClipspaceDialog.invalidate();
		
		this.element.style.display = "block";
	}
}

app.registerExtension({
	name: "Comfy.Clipspace",
	init(app) {
		app.openClipspace =
			function () {
				if(!ClipspaceDialog.instance) {
					ClipspaceDialog.instance = new ClipspaceDialog(app);
					ComfyApp.clipspace_invalidate_handler = ClipspaceDialog.invalidate;
				}

				if(ComfyApp.clipspace) {
					ClipspaceDialog.instance.show();
				}
				else
					app.ui.dialog.show("Clipspace is Empty!");
			};
	}
});
// import { ComfyWidgets, addValueControlWidget } from "../../scripts/widgets.js";
// import { app } from "../../scripts/app.js";

const CONVERTED_TYPE = "converted-widget";
const VALID_TYPES = ["STRING", "combo", "number"];

function isConvertableWidget(widget, config) {
	return VALID_TYPES.includes(widget.type) || VALID_TYPES.includes(config[0]);
}

function hideWidget(node, widget, suffix = "") {
	widget.origType = widget.type;
	widget.origComputeSize = widget.computeSize;
	widget.origSerializeValue = widget.serializeValue;
	widget.computeSize = () => [0, -4]; // -4 is due to the gap litegraph adds between widgets automatically
	widget.type = CONVERTED_TYPE + suffix;
	widget.serializeValue = () => {
		// Prevent serializing the widget if we have no input linked
		const { link } = node.inputs.find((i) => i.widget?.name === widget.name);
		if (link == null) {
			return undefined;
		}
		return widget.origSerializeValue ? widget.origSerializeValue() : widget.value;
	};

	// Hide any linked widgets, e.g. seed+seedControl
	if (widget.linkedWidgets) {
		for (const w of widget.linkedWidgets) {
			hideWidget(node, w, ":" + widget.name);
		}
	}
}

function showWidget(widget) {
	widget.type = widget.origType;
	widget.computeSize = widget.origComputeSize;
	widget.serializeValue = widget.origSerializeValue;

	delete widget.origType;
	delete widget.origComputeSize;
	delete widget.origSerializeValue;

	// Hide any linked widgets, e.g. seed+seedControl
	if (widget.linkedWidgets) {
		for (const w of widget.linkedWidgets) {
			showWidget(w);
		}
	}
}

function convertToInput(node, widget, config) {
	hideWidget(node, widget);

	const { linkType } = getWidgetType(config);

	// Add input and store widget config for creating on primitive node
	const sz = node.size;
	node.addInput(widget.name, linkType, {
		widget: { name: widget.name, config },
	});

	for (const widget of node.widgets) {
		widget.last_y += LiteGraph.NODE_SLOT_HEIGHT;
	}

	// Restore original size but grow if needed
	node.setSize([Math.max(sz[0], node.size[0]), Math.max(sz[1], node.size[1])]);
}

function convertToWidget(node, widget) {
	showWidget(widget);
	const sz = node.size;
	node.removeInput(node.inputs.findIndex((i) => i.widget?.name === widget.name));

	for (const widget of node.widgets) {
		widget.last_y -= LiteGraph.NODE_SLOT_HEIGHT;
	}

	// Restore original size but grow if needed
	node.setSize([Math.max(sz[0], node.size[0]), Math.max(sz[1], node.size[1])]);
}

function getWidgetType(config) {
	// Special handling for COMBO so we restrict links based on the entries
	let type = config[0];
	let linkType = type;
	if (type instanceof Array) {
		type = "COMBO";
		linkType = linkType.join(",");
	}
	return { type, linkType };
}

app.registerExtension({
	name: "Comfy.WidgetInputs",
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		// Add menu options to conver to/from widgets
		const origGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
		nodeType.prototype.getExtraMenuOptions = function (_, options) {
			const r = origGetExtraMenuOptions ? origGetExtraMenuOptions.apply(this, arguments) : undefined;

			if (this.widgets) {
				let toInput = [];
				let toWidget = [];
				for (const w of this.widgets) {
					if (w.type === CONVERTED_TYPE) {
						toWidget.push({
							content: `Convert ${w.name} to widget`,
							callback: () => convertToWidget(this, w),
						});
					} else {
						const config = nodeData?.input?.required[w.name] || nodeData?.input?.optional?.[w.name] || [w.type, w.options || {}];
						if (isConvertableWidget(w, config)) {
							toInput.push({
								content: `Convert ${w.name} to input`,
								callback: () => convertToInput(this, w, config),
							});
						}
					}
				}
				if (toInput.length) {
					options.push(...toInput, null);
				}

				if (toWidget.length) {
					options.push(...toWidget, null);
				}
			}

			return r;
		};

		// On initial configure of nodes hide all converted widgets
		const origOnConfigure = nodeType.prototype.onConfigure;
		nodeType.prototype.onConfigure = function () {
			const r = origOnConfigure ? origOnConfigure.apply(this, arguments) : undefined;

			if (this.inputs) {
				for (const input of this.inputs) {
					if (input.widget) {
						const w = this.widgets.find((w) => w.name === input.widget.name);
						if (w) {
							hideWidget(this, w);
						} else {
							convertToWidget(this, input)
						}
					}
				}
			}

			return r;
		};

		function isNodeAtPos(pos) {
			for (const n of app.graph._nodes) {
				if (n.pos[0] === pos[0] && n.pos[1] === pos[1]) {
					return true;
				}
			}
			return false;
		}

		// Double click a widget input to automatically attach a primitive
		const origOnInputDblClick = nodeType.prototype.onInputDblClick;
		const ignoreDblClick = Symbol();
		nodeType.prototype.onInputDblClick = function (slot) {
			const r = origOnInputDblClick ? origOnInputDblClick.apply(this, arguments) : undefined;

			const input = this.inputs[slot];
			if (!input.widget || !input[ignoreDblClick]) {
				// Not a widget input or already handled input
				if (!(input.type in ComfyWidgets) && !(input.widget.config?.[0] instanceof Array)) {
					return r; //also Not a ComfyWidgets input or combo (do nothing)
				}
			}

			// Create a primitive node
			const node = LiteGraph.createNode("PrimitiveNode");
			app.graph.add(node);

			// Calculate a position that wont directly overlap another node
			const pos = [this.pos[0] - node.size[0] - 30, this.pos[1]];
			while (isNodeAtPos(pos)) {
				pos[1] += LiteGraph.NODE_TITLE_HEIGHT;
			}

			node.pos = pos;
			node.connect(0, this, slot);
			node.title = input.name;

			// Prevent adding duplicates due to triple clicking
			input[ignoreDblClick] = true;
			setTimeout(() => {
				delete input[ignoreDblClick];
			}, 300);

			return r;
		};
	},
	registerCustomNodes() {
		class PrimitiveNode {
			constructor() {
				this.addOutput("connect to widget input", "*");
				this.serialize_widgets = true;
				this.isVirtualNode = true;
			}

			applyToGraph() {
				if (!this.outputs[0].links?.length) return;

				function get_links(node) {
					let links = [];
					for (const l of node.outputs[0].links) {
						const linkInfo = app.graph.links[l];
						const n = node.graph.getNodeById(linkInfo.target_id);
						if (n.type == "Reroute") {
							links = links.concat(get_links(n));
						} else {
							links.push(l);
						}
					}
					return links;
				}

				let links = get_links(this);
				// For each output link copy our value over the original widget value
				for (const l of links) {
					const linkInfo = app.graph.links[l];
					const node = this.graph.getNodeById(linkInfo.target_id);
					const input = node.inputs[linkInfo.target_slot];
					const widgetName = input.widget.name;
					if (widgetName) {
						const widget = node.widgets.find((w) => w.name === widgetName);
						if (widget) {
							widget.value = this.widgets[0].value;
							if (widget.callback) {
								widget.callback(widget.value, app.canvas, node, app.canvas.graph_mouse, {});
							}
						}
					}
				}
			}

			onConnectionsChange(_, index, connected) {
				if (connected) {
					if (this.outputs[0].links?.length) {
						if (!this.widgets?.length) {
							this.#onFirstConnection();
						}
						if (!this.widgets?.length && this.outputs[0].widget) {
							// On first load it often cant recreate the widget as the other node doesnt exist yet
							// Manually recreate it from the output info
							this.#createWidget(this.outputs[0].widget.config);
						}
					}
				} else if (!this.outputs[0].links?.length) {
					this.#onLastDisconnect();
				}
			}

			onConnectOutput(slot, type, input, target_node, target_slot) {
				// Fires before the link is made allowing us to reject it if it isn't valid

				// No widget, we cant connect
				if (!input.widget) {
					if (!(input.type in ComfyWidgets)) return false;
				}

				if (this.outputs[slot].links?.length) {
					return this.#isValidConnection(input);
				}
			}

			#onFirstConnection() {
				// First connection can fire before the graph is ready on initial load so random things can be missing
				const linkId = this.outputs[0].links[0];
				const link = this.graph.links[linkId];
				if (!link) return;

				const theirNode = this.graph.getNodeById(link.target_id);
				if (!theirNode || !theirNode.inputs) return;

				const input = theirNode.inputs[link.target_slot];
				if (!input) return;


				var _widget;
				if (!input.widget) {
					if (!(input.type in ComfyWidgets)) return;
					_widget = { "name": input.name, "config": [input.type, {}] }//fake widget
				} else {
					_widget = input.widget;
				}

				const widget = _widget;
				const { type, linkType } = getWidgetType(widget.config);
				// Update our output to restrict to the widget type
				this.outputs[0].type = linkType;
				this.outputs[0].name = type;
				this.outputs[0].widget = widget;

				this.#createWidget(widget.config, theirNode, widget.name);
			}

			#createWidget(inputData, node, widgetName) {
				let type = inputData[0];

				if (type instanceof Array) {
					type = "COMBO";
				}

				let widget;
				if (type in ComfyWidgets) {
					widget = (ComfyWidgets[type](this, "value", inputData, app) || {}).widget;
				} else {
					widget = this.addWidget(type, "value", null, () => { }, {});
				}

				if (node?.widgets && widget) {
					const theirWidget = node.widgets.find((w) => w.name === widgetName);
					if (theirWidget) {
						widget.value = theirWidget.value;
					}
				}

				if (widget.type === "number" || widget.type === "combo") {
					addValueControlWidget(this, widget, "fixed");
				}

				// When our value changes, update other widgets to reflect our changes
				// e.g. so LoadImage shows correct image
				const callback = widget.callback;
				const self = this;
				widget.callback = function () {
					const r = callback ? callback.apply(this, arguments) : undefined;
					self.applyToGraph();
					return r;
				};

				// Grow our node if required
				const sz = this.computeSize();
				if (this.size[0] < sz[0]) {
					this.size[0] = sz[0];
				}
				if (this.size[1] < sz[1]) {
					this.size[1] = sz[1];
				}

				requestAnimationFrame(() => {
					if (this.onResize) {
						this.onResize(this.size);
					}
				});
			}

			#isValidConnection(input) {
				// Only allow connections where the configs match
				const config1 = this.outputs[0].widget.config;
				const config2 = input.widget.config;

				if (config1[0] instanceof Array) {
					// These checks shouldnt actually be necessary as the types should match
					// but double checking doesn't hurt

					// New input isnt a combo
					if (!(config2[0] instanceof Array)) return false;
					// New imput combo has a different size
					if (config1[0].length !== config2[0].length) return false;
					// New input combo has different elements
					if (config1[0].find((v, i) => config2[0][i] !== v)) return false;
				} else if (config1[0] !== config2[0]) {
					// Configs dont match
					return false;
				}

				for (const k in config1[1]) {
					if (k !== "default") {
						if (config1[1][k] !== config2[1][k]) {
							return false;
						}
					}
				}

				return true;
			}

			#onLastDisconnect() {
				// We cant remove + re-add the output here as if you drag a link over the same link
				// it removes, then re-adds, causing it to break
				this.outputs[0].type = "*";
				this.outputs[0].name = "connect to widget input";
				delete this.outputs[0].widget;

				if (this.widgets) {
					// Allow widgets to cleanup
					for (const w of this.widgets) {
						if (w.onRemove) {
							w.onRemove();
						}
					}
					this.widgets.length = 0;
				}
			}
		}

		LiteGraph.registerNodeType(
			"PrimitiveNode",
			Object.assign(PrimitiveNode, {
				title: "Primitive",
			})
		);
		PrimitiveNode.category = "utils";
	},
});

// import { app } from "../../scripts/app.js";

// Allows for simple dynamic prompt replacement
// Inputs in the format {a|b} will have a random value of a or b chosen when the prompt is queued.

/*
 * Strips C-style line and block comments from a string
 */
function stripComments(str) {
	return str.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g,'');
}

app.registerExtension({
	name: "Comfy.DynamicPrompts",
	nodeCreated(node) {
		if (node.widgets) {
			// Locate dynamic prompt text widgets
			// Include any widgets with dynamicPrompts set to true, and customtext
			const widgets = node.widgets.filter(
				(n) => (n.type === "customtext" && n.dynamicPrompts !== false) || n.dynamicPrompts
			);
			for (const widget of widgets) {
				// Override the serialization of the value to resolve dynamic prompts for all widgets supporting it in this node
				widget.serializeValue = (workflowNode, widgetIndex) => {
					let prompt = stripComments(widget.value);
					while (prompt.replace("\\{", "").includes("{") && prompt.replace("\\}", "").includes("}")) {
						const startIndex = prompt.replace("\\{", "00").indexOf("{");
						const endIndex = prompt.replace("\\}", "00").indexOf("}");

						const optionsString = prompt.substring(startIndex + 1, endIndex);
						const options = optionsString.split("|");

						const randomIndex = Math.floor(Math.random() * options.length);
						const randomOption = options[randomIndex];

						prompt = prompt.substring(0, startIndex) + randomOption + prompt.substring(endIndex + 1);
					}

					// Overwrite the value in the serialized workflow pnginfo
					if (workflowNode?.widgets_values)
						workflowNode.widgets_values[widgetIndex] = prompt;

					return prompt;
				};
			}
		}
	},
});

// import { app } from "../../scripts/app.js";

// Inverts the scrolling of context menus

id = "Comfy.InvertMenuScrolling";
app.registerExtension({
	name: id,
	init() {
		const ctxMenu = LiteGraph.ContextMenu;
		const replace = () => {
			LiteGraph.ContextMenu = function (values, options) {
				options = options || {};
				if (options.scroll_speed) {
					options.scroll_speed *= -1;
				} else {
					options.scroll_speed = -0.1;
				}
				return ctxMenu.call(this, values, options);
			};
			LiteGraph.ContextMenu.prototype = ctxMenu.prototype;
		};
		app.ui.settings.addSetting({
			id,
			name: "Invert Menu Scrolling",
			type: "boolean",
			defaultValue: false,
			onChange(value) {
				if (value) {
					replace();
				} else {
					LiteGraph.ContextMenu = ctxMenu;
				}
			},
		});
	},
});

// import {app} from "/scripts/app.js";

// Adds filtering to combo context menus

const ext = {
	name: "Comfy.ContextMenuFilter",
	init() {
		const ctxMenu = LiteGraph.ContextMenu;

		LiteGraph.ContextMenu = function (values, options) {
			const ctx = ctxMenu.call(this, values, options);

			// If we are a dark menu (only used for combo boxes) then add a filter input
			if (options?.className === "dark" && values?.length > 10) {
				const filter = document.createElement("input");
				filter.classList.add("comfy-context-menu-filter");
				filter.placeholder = "Filter list";
				this.root.prepend(filter);

				const items = Array.from(this.root.querySelectorAll(".litemenu-entry"));
				let displayedItems = [...items];
				let itemCount = displayedItems.length;

				// We must request an animation frame for the current node of the active canvas to update.
				requestAnimationFrame(() => {
					const currentNode = LGraphCanvas.active_canvas.current_node;
					const clickedComboValue = currentNode.widgets
						.filter(w => w.type === "combo" && w.options.values.length === values.length)
						.find(w => w.options.values.every((v, i) => v === values[i]))
						.value;

					let selectedIndex = values.findIndex(v => v === clickedComboValue);
					let selectedItem = displayedItems?.[selectedIndex];
					updateSelected();

					// Apply highlighting to the selected item
					function updateSelected() {
						selectedItem?.style.setProperty("background-color", "");
						selectedItem?.style.setProperty("color", "");
						selectedItem = displayedItems[selectedIndex];
						selectedItem?.style.setProperty("background-color", "#ccc", "important");
						selectedItem?.style.setProperty("color", "#000", "important");
					}

					const positionList = () => {
						const rect = this.root.getBoundingClientRect();

						// If the top is off-screen then shift the element with scaling applied
						if (rect.top < 0) {
							const scale = 1 - this.root.getBoundingClientRect().height / this.root.clientHeight;
							const shift = (this.root.clientHeight * scale) / 2;
							this.root.style.top = -shift + "px";
						}
					}

					// Arrow up/down to select items
					filter.addEventListener("keydown", (event) => {
						switch (event.key) {
							case "ArrowUp":
								event.preventDefault();
								if (selectedIndex === 0) {
									selectedIndex = itemCount - 1;
								} else {
									selectedIndex--;
								}
								updateSelected();
								break;
							case "ArrowRight":
								event.preventDefault();
								selectedIndex = itemCount - 1;
								updateSelected();
								break;
							case "ArrowDown":
								event.preventDefault();
								if (selectedIndex === itemCount - 1) {
									selectedIndex = 0;
								} else {
									selectedIndex++;
								}
								updateSelected();
								break;
							case "ArrowLeft":
								event.preventDefault();
								selectedIndex = 0;
								updateSelected();
								break;
							case "Enter":
								selectedItem?.click();
								break;
							case "Escape":
								this.close();
								break;
						}
					});

					filter.addEventListener("input", () => {
						// Hide all items that don't match our filter
						const term = filter.value.toLocaleLowerCase();
						// When filtering, recompute which items are visible for arrow up/down and maintain selection.
						displayedItems = items.filter(item => {
							const isVisible = !term || item.textContent.toLocaleLowerCase().includes(term);
							item.style.display = isVisible ? "block" : "none";
							return isVisible;
						});

						selectedIndex = 0;
						if (displayedItems.includes(selectedItem)) {
							selectedIndex = displayedItems.findIndex(d => d === selectedItem);
						}
						itemCount = displayedItems.length;

						updateSelected();

						// If we have an event then we can try and position the list under the source
						if (options.event) {
							let top = options.event.clientY - 10;

							const bodyRect = document.body.getBoundingClientRect();
							const rootRect = this.root.getBoundingClientRect();
							if (bodyRect.height && top > bodyRect.height - rootRect.height - 10) {
								top = Math.max(0, bodyRect.height - rootRect.height - 10);
							}

							this.root.style.top = top + "px";
							positionList();
						}
					});

					requestAnimationFrame(() => {
						// Focus the filter box when opening
						filter.focus();

						positionList();
					});
				})
			}

			return ctx;
		};

		LiteGraph.ContextMenu.prototype = ctxMenu.prototype;
	},
}

app.registerExtension(ext);

// import { app } from "../../scripts/app.js";

// Shift + drag/resize to snap to grid

app.registerExtension({
	name: "Comfy.SnapToGrid",
	init() {
		// Add setting to control grid size
		app.ui.settings.addSetting({
			id: "Comfy.SnapToGrid.GridSize",
			name: "Grid Size",
			type: "slider",
			attrs: {
				min: 1,
				max: 500,
			},
			tooltip:
				"When dragging and resizing nodes while holding shift they will be aligned to the grid, this controls the size of that grid.",
			defaultValue: LiteGraph.CANVAS_GRID_SIZE,
			onChange(value) {
				LiteGraph.CANVAS_GRID_SIZE = +value;
			},
		});

		// After moving a node, if the shift key is down align it to grid
		const onNodeMoved = app.canvas.onNodeMoved;
		app.canvas.onNodeMoved = function (node) {
			const r = onNodeMoved?.apply(this, arguments);

			if (app.shiftDown) {
				// Ensure all selected nodes are realigned
				for (const id in this.selected_nodes) {
					this.selected_nodes[id].alignToGrid();
				}
			}

			return r;
		};

		// When a node is added, add a resize handler to it so we can fix align the size with the grid
		const onNodeAdded = app.graph.onNodeAdded;
		app.graph.onNodeAdded = function (node) {
			const onResize = node.onResize;
			node.onResize = function () {
				if (app.shiftDown) {
					const w = LiteGraph.CANVAS_GRID_SIZE * Math.round(node.size[0] / LiteGraph.CANVAS_GRID_SIZE);
					const h = LiteGraph.CANVAS_GRID_SIZE * Math.round(node.size[1] / LiteGraph.CANVAS_GRID_SIZE);
					node.size[0] = w;
					node.size[1] = h;
				}
				return onResize?.apply(this, arguments);
			};
			return onNodeAdded?.apply(this, arguments);
		};

		// Draw a preview of where the node will go if holding shift and the node is selected
		const origDrawNode = LGraphCanvas.prototype.drawNode;
		LGraphCanvas.prototype.drawNode = function (node, ctx) {
			if (app.shiftDown && this.node_dragged && node.id in this.selected_nodes) {
				const x = LiteGraph.CANVAS_GRID_SIZE * Math.round(node.pos[0] / LiteGraph.CANVAS_GRID_SIZE);
				const y = LiteGraph.CANVAS_GRID_SIZE * Math.round(node.pos[1] / LiteGraph.CANVAS_GRID_SIZE);

				const shiftX = x - node.pos[0];
				let shiftY = y - node.pos[1];

				let w, h;
				if (node.flags.collapsed) {
					w = node._collapsed_width;
					h = LiteGraph.NODE_TITLE_HEIGHT;
					shiftY -= LiteGraph.NODE_TITLE_HEIGHT;
				} else {
					w = node.size[0];
					h = node.size[1];
					let titleMode = node.constructor.title_mode;
					if (titleMode !== LiteGraph.TRANSPARENT_TITLE && titleMode !== LiteGraph.NO_TITLE) {
						h += LiteGraph.NODE_TITLE_HEIGHT;
						shiftY -= LiteGraph.NODE_TITLE_HEIGHT;
					}
				}
				const f = ctx.fillStyle;
				ctx.fillStyle = "rgba(100, 100, 100, 0.5)";
				ctx.fillRect(shiftX, shiftY, w, h);
				ctx.fillStyle = f;
			}

			return origDrawNode.apply(this, arguments);
		};
	},
});

// import { app } from "../../scripts/app.js";
// import { ComfyWidgets } from "../../scripts/widgets.js";
// Adds defaults for quickly adding nodes with middle click on the input/output

app.registerExtension({
	name: "Comfy.SlotDefaults",
	suggestionsNumber: null,
	init() {
		LiteGraph.search_filter_enabled = true;
		LiteGraph.middle_click_slot_add_default_node = true;
		this.suggestionsNumber = app.ui.settings.addSetting({
			id: "Comfy.NodeSuggestions.number",
			name: "Number of nodes suggestions",
			type: "slider",
			attrs: {
				min: 1,
				max: 100,
				step: 1,
			},
			defaultValue: 5,
			onChange: (newVal, oldVal) => {
				this.setDefaults(newVal);
			}
		});
	},
	slot_types_default_out: {},
	slot_types_default_in: {},
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
				var nodeId = nodeData.name;
		var inputs = [];
		inputs = nodeData["input"]["required"]; //only show required inputs to reduce the mess also not logical to create node with optional inputs
		for (const inputKey in inputs) {
			var input = (inputs[inputKey]);
			if (typeof input[0] !== "string") continue;

			var type = input[0]
			if (type in ComfyWidgets) {
				var customProperties = input[1]
				if (!(customProperties?.forceInput)) continue; //ignore widgets that don't force input
			}

			if (!(type in this.slot_types_default_out)) {
				this.slot_types_default_out[type] = ["Reroute"];
			}
			if (this.slot_types_default_out[type].includes(nodeId)) continue;
			this.slot_types_default_out[type].push(nodeId);

			// Input types have to be stored as lower case
			// Store each node that can handle this input type
			const lowerType = type.toLocaleLowerCase();
			if (!(lowerType in LiteGraph.registered_slot_in_types)) {
				LiteGraph.registered_slot_in_types[lowerType] = { nodes: [] };
			}
			LiteGraph.registered_slot_in_types[lowerType].nodes.push(nodeType.comfyClass);
		} 

		var outputs = nodeData["output"];
		for (const key in outputs) {
			var type = outputs[key];
			if (!(type in this.slot_types_default_in)) {
				this.slot_types_default_in[type] = ["Reroute"];// ["Reroute", "Primitive"];  primitive doesn't always work :'()
			}

			this.slot_types_default_in[type].push(nodeId);

			// Store each node that can handle this output type
			if (!(type in LiteGraph.registered_slot_out_types)) {
				LiteGraph.registered_slot_out_types[type] = { nodes: [] };
			}
			LiteGraph.registered_slot_out_types[type].nodes.push(nodeType.comfyClass);

			if(!LiteGraph.slot_types_out.includes(type)) {
				LiteGraph.slot_types_out.push(type);
			}
		}
		var maxNum = this.suggestionsNumber.value;
		this.setDefaults(maxNum);
	},
	setDefaults(maxNum) {

		LiteGraph.slot_types_default_out = {};
		LiteGraph.slot_types_default_in = {};

		for (const type in this.slot_types_default_out) {
			LiteGraph.slot_types_default_out[type] = this.slot_types_default_out[type].slice(0, maxNum);
		}
		for (const type in this.slot_types_default_in) {
			LiteGraph.slot_types_default_in[type] = this.slot_types_default_in[type].slice(0, maxNum);
		}
	}
});

// import { app } from "../../scripts/app.js";
// import { ComfyDialog, $el } from "../../scripts/ui.js";
// import { ComfyApp } from "../../scripts/app.js";
// import { api } from "../../scripts/api.js"
// import { ClipspaceDialog } from "./clipspace.js";

// Helper function to convert a data URL to a Blob object
function dataURLToBlob(dataURL) {
	const parts = dataURL.split(';base64,');
	const contentType = parts[0].split(':')[1];
	const byteString = atob(parts[1]);
	const arrayBuffer = new ArrayBuffer(byteString.length);
	const uint8Array = new Uint8Array(arrayBuffer);
	for (let i = 0; i < byteString.length; i++) {
		uint8Array[i] = byteString.charCodeAt(i);
	}
	return new Blob([arrayBuffer], { type: contentType });
}

function loadedImageToBlob(image) {
	const canvas = document.createElement('canvas');

	canvas.width = image.width;
	canvas.height = image.height;

	const ctx = canvas.getContext('2d');

	ctx.drawImage(image, 0, 0);

	const dataURL = canvas.toDataURL('image/png', 1);
	const blob = dataURLToBlob(dataURL);

	return blob;
}

async function uploadMask(filepath, formData) {
	await api.fetchApi('/upload/mask', {
		method: 'POST',
		body: formData
	}).then(response => {}).catch(error => {
		console.error('Error:', error);
	});

	ComfyApp.clipspace.imgs[ComfyApp.clipspace['selectedIndex']] = new Image();
	ComfyApp.clipspace.imgs[ComfyApp.clipspace['selectedIndex']].src = api.apiURL("/view?" + new URLSearchParams(filepath).toString() + app.getPreviewFormatParam());

	if(ComfyApp.clipspace.images)
		ComfyApp.clipspace.images[ComfyApp.clipspace['selectedIndex']] = filepath;

	ClipspaceDialog.invalidatePreview();
}

function prepareRGB(image, backupCanvas, backupCtx) {
	// paste mask data into alpha channel
	backupCtx.drawImage(image, 0, 0, backupCanvas.width, backupCanvas.height);
	const backupData = backupCtx.getImageData(0, 0, backupCanvas.width, backupCanvas.height);

	// refine mask image
	for (let i = 0; i < backupData.data.length; i += 4) {
		if(backupData.data[i+3] == 255)
			backupData.data[i+3] = 0;
		else
			backupData.data[i+3] = 255;

		backupData.data[i] = 0;
		backupData.data[i+1] = 0;
		backupData.data[i+2] = 0;
	}

	backupCtx.globalCompositeOperation = 'source-over';
	backupCtx.putImageData(backupData, 0, 0);
}

class MaskEditorDialog extends ComfyDialog {
	static instance = null;

	static getInstance() {
		if(!MaskEditorDialog.instance) {
			MaskEditorDialog.instance = new MaskEditorDialog(app);
		}

		return MaskEditorDialog.instance;
	}

	is_layout_created =  false;

	constructor() {
		super();
		this.element = $el("div.comfy-modal", { parent: document.body }, 
			[ $el("div.comfy-modal-content", 
				[...this.createButtons()]),
			]);
	}

	createButtons() {
		return [];
	}

	createButton(name, callback) {
		var button = document.createElement("button");
		button.innerText = name;
		button.addEventListener("click", callback);
		return button;
	}

	createLeftButton(name, callback) {
		var button = this.createButton(name, callback);
		button.style.cssFloat = "left";
		button.style.marginRight = "4px";
		return button;
	}

	createRightButton(name, callback) {
		var button = this.createButton(name, callback);
		button.style.cssFloat = "right";
		button.style.marginLeft = "4px";
		return button;
	}

	createLeftSlider(self, name, callback) {
		const divElement = document.createElement('div');
		divElement.id = "maskeditor-slider";
		divElement.style.cssFloat = "left";
		divElement.style.fontFamily = "sans-serif";
		divElement.style.marginRight = "4px";
		divElement.style.color = "var(--input-text)";
		divElement.style.backgroundColor = "var(--comfy-input-bg)";
		divElement.style.borderRadius = "8px";
		divElement.style.borderColor = "var(--border-color)";
		divElement.style.borderStyle = "solid";
		divElement.style.fontSize = "15px";
		divElement.style.height = "21px";
		divElement.style.padding = "1px 6px";
		divElement.style.display = "flex";
		divElement.style.position = "relative";
		divElement.style.top = "2px";
		self.brush_slider_input = document.createElement('input');
		self.brush_slider_input.setAttribute('type', 'range');
		self.brush_slider_input.setAttribute('min', '1');
		self.brush_slider_input.setAttribute('max', '100');
		self.brush_slider_input.setAttribute('value', '10');
		const labelElement = document.createElement("label");
		labelElement.textContent = name;

		divElement.appendChild(labelElement);
		divElement.appendChild(self.brush_slider_input);

		self.brush_slider_input.addEventListener("change", callback);

		return divElement;
	}

	setlayout(imgCanvas, maskCanvas) {
		const self = this;

		// If it is specified as relative, using it only as a hidden placeholder for padding is recommended
		// to prevent anomalies where it exceeds a certain size and goes outside of the window.
		var placeholder = document.createElement("div");
		placeholder.style.position = "relative";
		placeholder.style.height = "50px";

		var bottom_panel = document.createElement("div");
		bottom_panel.style.position = "absolute";
		bottom_panel.style.bottom = "0px";
		bottom_panel.style.left = "20px";
		bottom_panel.style.right = "20px";
		bottom_panel.style.height = "50px";

		var brush = document.createElement("div");
		brush.id = "brush";
		brush.style.backgroundColor = "transparent";
		brush.style.outline = "1px dashed black";
		brush.style.boxShadow = "0 0 0 1px white";
		brush.style.borderRadius = "50%";
		brush.style.MozBorderRadius = "50%";
		brush.style.WebkitBorderRadius = "50%";
		brush.style.position = "absolute";
		brush.style.zIndex = 8889;
		brush.style.pointerEvents = "none";
		this.brush = brush;
		this.element.appendChild(imgCanvas);
		this.element.appendChild(maskCanvas);
		this.element.appendChild(placeholder); // must below z-index than bottom_panel to avoid covering button
		this.element.appendChild(bottom_panel);
		document.body.appendChild(brush);

		var brush_size_slider = this.createLeftSlider(self, "Thickness", (event) => {
			self.brush_size = event.target.value;
			self.updateBrushPreview(self, null, null);
		});
		var clearButton = this.createLeftButton("Clear",
			() => {
				self.maskCtx.clearRect(0, 0, self.maskCanvas.width, self.maskCanvas.height);
				self.backupCtx.clearRect(0, 0, self.backupCanvas.width, self.backupCanvas.height);
			});
		var cancelButton = this.createRightButton("Cancel", () => {
			document.removeEventListener("mouseup", MaskEditorDialog.handleMouseUp);
			document.removeEventListener("keydown", MaskEditorDialog.handleKeyDown);
			self.close();
		});

		this.saveButton = this.createRightButton("Save", () => {
			document.removeEventListener("mouseup", MaskEditorDialog.handleMouseUp);
			document.removeEventListener("keydown", MaskEditorDialog.handleKeyDown);
				self.save();
			});

		this.element.appendChild(imgCanvas);
		this.element.appendChild(maskCanvas);
		this.element.appendChild(placeholder); // must below z-index than bottom_panel to avoid covering button
		this.element.appendChild(bottom_panel);

		bottom_panel.appendChild(clearButton);
		bottom_panel.appendChild(this.saveButton);
		bottom_panel.appendChild(cancelButton);
		bottom_panel.appendChild(brush_size_slider);

		imgCanvas.style.position = "relative";
		imgCanvas.style.top = "200";
		imgCanvas.style.left = "0";

		maskCanvas.style.position = "absolute";
	}

	show() {
		if(!this.is_layout_created) {
			// layout
			const imgCanvas = document.createElement('canvas');
			const maskCanvas = document.createElement('canvas');
			const backupCanvas = document.createElement('canvas');

			imgCanvas.id = "imageCanvas";
			maskCanvas.id = "maskCanvas";
			backupCanvas.id = "backupCanvas";

			this.setlayout(imgCanvas, maskCanvas);

			// prepare content
			this.imgCanvas = imgCanvas;
			this.maskCanvas = maskCanvas;
			this.backupCanvas = backupCanvas;
			this.maskCtx = maskCanvas.getContext('2d');
			this.backupCtx = backupCanvas.getContext('2d');

			this.setEventHandler(maskCanvas);

			this.is_layout_created = true;

			// replacement of onClose hook since close is not real close
			const self = this;
			const observer = new MutationObserver(function(mutations) {
			mutations.forEach(function(mutation) {
					if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
						if(self.last_display_style && self.last_display_style != 'none' && self.element.style.display == 'none') {
							ComfyApp.onClipspaceEditorClosed();
						}

						self.last_display_style = self.element.style.display;
					}
				});
			});

			const config = { attributes: true };
			observer.observe(this.element, config);
		}

		this.setImages(this.imgCanvas, this.backupCanvas);

		if(ComfyApp.clipspace_return_node) {
			this.saveButton.innerText = "Save to node";
		}
		else {
			this.saveButton.innerText = "Save";
		}
		this.saveButton.disabled = false;

		this.element.style.display = "block";
		this.element.style.zIndex = 8888; // NOTE: alert dialog must be high priority.
	}

	isOpened() {
		return this.element.style.display == "block";
	}

	setImages(imgCanvas, backupCanvas) {
		const imgCtx = imgCanvas.getContext('2d');
		const backupCtx = backupCanvas.getContext('2d');
		const maskCtx = this.maskCtx;
		const maskCanvas = this.maskCanvas;

		backupCtx.clearRect(0,0,this.backupCanvas.width,this.backupCanvas.height);
		imgCtx.clearRect(0,0,this.imgCanvas.width,this.imgCanvas.height);
		maskCtx.clearRect(0,0,this.maskCanvas.width,this.maskCanvas.height);

		// image load
		const orig_image = new Image();
		window.addEventListener("resize", () => {
			// repositioning
			imgCanvas.width = window.innerWidth - 250;
			imgCanvas.height = window.innerHeight - 200;

			// redraw image
			let drawWidth = orig_image.width;
			let drawHeight = orig_image.height;
			if (orig_image.width > imgCanvas.width) {
				drawWidth = imgCanvas.width;
				drawHeight = (drawWidth / orig_image.width) * orig_image.height;
			}

			if (drawHeight > imgCanvas.height) {
				drawHeight = imgCanvas.height;
				drawWidth = (drawHeight / orig_image.height) * orig_image.width;
			}

			imgCtx.drawImage(orig_image, 0, 0, drawWidth, drawHeight);

			// update mask
			maskCanvas.width = drawWidth;
			maskCanvas.height = drawHeight;
			maskCanvas.style.top = imgCanvas.offsetTop + "px";
			maskCanvas.style.left = imgCanvas.offsetLeft + "px";
			backupCtx.drawImage(maskCanvas, 0, 0, maskCanvas.width, maskCanvas.height, 0, 0, backupCanvas.width, backupCanvas.height);
			maskCtx.drawImage(backupCanvas, 0, 0, backupCanvas.width, backupCanvas.height, 0, 0, maskCanvas.width, maskCanvas.height);
		});

		const filepath = ComfyApp.clipspace.images;

		const touched_image = new Image();

		touched_image.onload = function() {
			backupCanvas.width = touched_image.width;
			backupCanvas.height = touched_image.height;

			prepareRGB(touched_image, backupCanvas, backupCtx);
		};

		const alpha_url = new URL(ComfyApp.clipspace.imgs[ComfyApp.clipspace['selectedIndex']].src)
		alpha_url.searchParams.delete('channel');
		alpha_url.searchParams.delete('preview');
		alpha_url.searchParams.set('channel', 'a');
		touched_image.src = alpha_url;

		// original image load
		orig_image.onload = function() {
			window.dispatchEvent(new Event('resize'));
		};

		const rgb_url = new URL(ComfyApp.clipspace.imgs[ComfyApp.clipspace['selectedIndex']].src);
		rgb_url.searchParams.delete('channel');
		rgb_url.searchParams.set('channel', 'rgb');
		orig_image.src = rgb_url;
		this.image = orig_image;
	}

	setEventHandler(maskCanvas) {
		maskCanvas.addEventListener("contextmenu", (event) => {
			event.preventDefault();
		});

		const self = this;
		maskCanvas.addEventListener('wheel', (event) => this.handleWheelEvent(self,event));
		maskCanvas.addEventListener('pointerdown', (event) => this.handlePointerDown(self,event));
		document.addEventListener('pointerup', MaskEditorDialog.handlePointerUp);
		maskCanvas.addEventListener('pointermove', (event) => this.draw_move(self,event));
		maskCanvas.addEventListener('touchmove', (event) => this.draw_move(self,event));
		maskCanvas.addEventListener('pointerover', (event) => { this.brush.style.display = "block"; });
		maskCanvas.addEventListener('pointerleave', (event) => { this.brush.style.display = "none"; });
		document.addEventListener('keydown', MaskEditorDialog.handleKeyDown);
	}

	brush_size = 10;
	drawing_mode = false;
	lastx = -1;
	lasty = -1;
	lasttime = 0;

	static handleKeyDown(event) {
		const self = MaskEditorDialog.instance;
		if (event.key === ']') {
			self.brush_size = Math.min(self.brush_size+2, 100);
		} else if (event.key === '[') {
			self.brush_size = Math.max(self.brush_size-2, 1);
		} else if(event.key === 'Enter') {
			self.save();
		}

		self.updateBrushPreview(self);
	}

	static handlePointerUp(event) {
		event.preventDefault();
		MaskEditorDialog.instance.drawing_mode = false;
	}

	updateBrushPreview(self) {
		const brush = self.brush;

		var centerX = self.cursorX;
		var centerY = self.cursorY;

		brush.style.width = self.brush_size * 2 + "px";
		brush.style.height = self.brush_size * 2 + "px";
		brush.style.left = (centerX - self.brush_size) + "px";
		brush.style.top = (centerY - self.brush_size) + "px";
	}

	handleWheelEvent(self, event) {
		if(event.deltaY < 0)
			self.brush_size = Math.min(self.brush_size+2, 100);
		else
			self.brush_size = Math.max(self.brush_size-2, 1);

		self.brush_slider_input.value = self.brush_size;

		self.updateBrushPreview(self);
	}

	draw_move(self, event) {
		event.preventDefault();

		this.cursorX = event.pageX;
		this.cursorY = event.pageY;

		self.updateBrushPreview(self);

		if (window.TouchEvent && event instanceof TouchEvent || event.buttons == 1) {
			var diff = performance.now() - self.lasttime;

			const maskRect = self.maskCanvas.getBoundingClientRect();

			var x = event.offsetX;
			var y = event.offsetY

			if(event.offsetX == null) {
				x = event.targetTouches[0].clientX - maskRect.left;
			}

			if(event.offsetY == null) {
				y = event.targetTouches[0].clientY - maskRect.top;
			}

			var brush_size = this.brush_size;
			if(event instanceof PointerEvent && event.pointerType == 'pen') {
				brush_size *= event.pressure;
				this.last_pressure = event.pressure;
			}
			else if(window.TouchEvent && event instanceof TouchEvent && diff < 20){
				// The firing interval of PointerEvents in Pen is unreliable, so it is supplemented by TouchEvents.
				brush_size *= this.last_pressure;
			}
			else {
				brush_size = this.brush_size;
			}

			if(diff > 20 && !this.drawing_mode)
				requestAnimationFrame(() => {
					self.maskCtx.beginPath();
					self.maskCtx.fillStyle = "rgb(0,0,0)";
					self.maskCtx.globalCompositeOperation = "source-over";
					self.maskCtx.arc(x, y, brush_size, 0, Math.PI * 2, false);
					self.maskCtx.fill();
					self.lastx = x;
					self.lasty = y;
				});
			else
				requestAnimationFrame(() => {
					self.maskCtx.beginPath();
					self.maskCtx.fillStyle = "rgb(0,0,0)";
					self.maskCtx.globalCompositeOperation = "source-over";

					var dx = x - self.lastx;
					var dy = y - self.lasty;

					var distance = Math.sqrt(dx * dx + dy * dy);
					var directionX = dx / distance;
					var directionY = dy / distance;

					for (var i = 0; i < distance; i+=5) {
						var px = self.lastx + (directionX * i);
						var py = self.lasty + (directionY * i);
						self.maskCtx.arc(px, py, brush_size, 0, Math.PI * 2, false);
						self.maskCtx.fill();
					}
					self.lastx = x;
					self.lasty = y;
				});

			self.lasttime = performance.now();
		}
		else if(event.buttons == 2 || event.buttons == 5 || event.buttons == 32) {
			const maskRect = self.maskCanvas.getBoundingClientRect();
			const x = event.offsetX || event.targetTouches[0].clientX - maskRect.left;
			const y = event.offsetY || event.targetTouches[0].clientY - maskRect.top;

			var brush_size = this.brush_size;
			if(event instanceof PointerEvent && event.pointerType == 'pen') {
				brush_size *= event.pressure;
				this.last_pressure = event.pressure;
			}
			else if(window.TouchEvent && event instanceof TouchEvent && diff < 20){
				brush_size *= this.last_pressure;
			}
			else {
				brush_size = this.brush_size;
			}

			if(diff > 20 && !drawing_mode) // cannot tracking drawing_mode for touch event
				requestAnimationFrame(() => {
					self.maskCtx.beginPath();
					self.maskCtx.globalCompositeOperation = "destination-out";
					self.maskCtx.arc(x, y, brush_size, 0, Math.PI * 2, false);
					self.maskCtx.fill();
					self.lastx = x;
					self.lasty = y;
				});
			else
				requestAnimationFrame(() => {
					self.maskCtx.beginPath();
					self.maskCtx.globalCompositeOperation = "destination-out";
					
					var dx = x - self.lastx;
					var dy = y - self.lasty;

					var distance = Math.sqrt(dx * dx + dy * dy);
					var directionX = dx / distance;
					var directionY = dy / distance;

					for (var i = 0; i < distance; i+=5) {
						var px = self.lastx + (directionX * i);
						var py = self.lasty + (directionY * i);
						self.maskCtx.arc(px, py, brush_size, 0, Math.PI * 2, false);
						self.maskCtx.fill();
					}
					self.lastx = x;
					self.lasty = y;
				});

				self.lasttime = performance.now();
		}
	}

	handlePointerDown(self, event) {
		var brush_size = this.brush_size;
		if(event instanceof PointerEvent && event.pointerType == 'pen') {
			brush_size *= event.pressure;
			this.last_pressure = event.pressure;
		}

		if ([0, 2, 5].includes(event.button)) {
			self.drawing_mode = true;

			event.preventDefault();
			const maskRect = self.maskCanvas.getBoundingClientRect();
			const x = event.offsetX || event.targetTouches[0].clientX - maskRect.left;
			const y = event.offsetY || event.targetTouches[0].clientY - maskRect.top;

			self.maskCtx.beginPath();
			if (event.button == 0) {
				self.maskCtx.fillStyle = "rgb(0,0,0)";
				self.maskCtx.globalCompositeOperation = "source-over";
			} else {
				self.maskCtx.globalCompositeOperation = "destination-out";
			}
			self.maskCtx.arc(x, y, brush_size, 0, Math.PI * 2, false);
			self.maskCtx.fill();
			self.lastx = x;
			self.lasty = y;
			self.lasttime = performance.now();
		}
	}

	async save() {
		const backupCtx = this.backupCanvas.getContext('2d', {willReadFrequently:true});

		backupCtx.clearRect(0,0,this.backupCanvas.width,this.backupCanvas.height);
		backupCtx.drawImage(this.maskCanvas,
			0, 0, this.maskCanvas.width, this.maskCanvas.height,
			0, 0, this.backupCanvas.width, this.backupCanvas.height);

		// paste mask data into alpha channel
		const backupData = backupCtx.getImageData(0, 0, this.backupCanvas.width, this.backupCanvas.height);

		// refine mask image
		for (let i = 0; i < backupData.data.length; i += 4) {
			if(backupData.data[i+3] == 255)
				backupData.data[i+3] = 0;
			else
				backupData.data[i+3] = 255;

			backupData.data[i] = 0;
			backupData.data[i+1] = 0;
			backupData.data[i+2] = 0;
		}

		backupCtx.globalCompositeOperation = 'source-over';
		backupCtx.putImageData(backupData, 0, 0);

		const formData = new FormData();
		const filename = "clipspace-mask-" + performance.now() + ".png";

		const item =
			{
				"filename": filename,
				"subfolder": "clipspace",
				"type": "input",
			};

		if(ComfyApp.clipspace.images)
			ComfyApp.clipspace.images[0] = item;

		if(ComfyApp.clipspace.widgets) {
			const index = ComfyApp.clipspace.widgets.findIndex(obj => obj.name === 'image');

			if(index >= 0)
				ComfyApp.clipspace.widgets[index].value = item;
		}

		const dataURL = this.backupCanvas.toDataURL();
		const blob = dataURLToBlob(dataURL);

		let original_url = new URL(this.image.src);

		const original_ref = { filename: original_url.searchParams.get('filename') };

		let original_subfolder = original_url.searchParams.get("subfolder");
		if(original_subfolder)
			original_ref.subfolder = original_subfolder;

		let original_type = original_url.searchParams.get("type");
		if(original_type)
			original_ref.type = original_type;

		formData.append('image', blob, filename);
		formData.append('original_ref', JSON.stringify(original_ref));
		formData.append('type', "input");
		formData.append('subfolder', "clipspace");

		this.saveButton.innerText = "Saving...";
		this.saveButton.disabled = true;
		await uploadMask(item, formData);
		ComfyApp.onClipspaceEditorSave();
		this.close();
	}
}

app.registerExtension({
	name: "Comfy.MaskEditor",
	init(app) {
		ComfyApp.open_maskeditor =
			function () {
				const dlg = MaskEditorDialog.getInstance();
				if(!dlg.isOpened()) {
					dlg.show();
				}
			};

		const context_predicate = () => ComfyApp.clipspace && ComfyApp.clipspace.imgs && ComfyApp.clipspace.imgs.length > 0
		ClipspaceDialog.registerButton("MaskEditor", context_predicate, ComfyApp.open_maskeditor);
	}
});
// import { app } from "../../scripts/app.js";

// Node that allows you to redirect connections for cleaner graphs

app.registerExtension({
	name: "Comfy.RerouteNode",
	registerCustomNodes() {
		class RerouteNode {
			constructor() {
				if (!this.properties) {
					this.properties = {};
				}
				this.properties.showOutputText = RerouteNode.defaultVisibility;
				this.properties.horizontal = false;

				this.addInput("", "*");
				this.addOutput(this.properties.showOutputText ? "*" : "", "*");

				this.onConnectionsChange = function (type, index, connected, link_info) {
					this.applyOrientation();

					// Prevent multiple connections to different types when we have no input
					if (connected && type === LiteGraph.OUTPUT) {
						// Ignore wildcard nodes as these will be updated to real types
						const types = new Set(this.outputs[0].links.map((l) => app.graph.links[l].type).filter((t) => t !== "*"));
						if (types.size > 1) {
							const linksToDisconnect = [];
							for (let i = 0; i < this.outputs[0].links.length - 1; i++) {
								const linkId = this.outputs[0].links[i];
								const link = app.graph.links[linkId];
								linksToDisconnect.push(link);
							}
							for (const link of linksToDisconnect) {
								const node = app.graph.getNodeById(link.target_id);
								node.disconnectInput(link.target_slot);
							}
						}
					}

					// Find root input
					let currentNode = this;
					let updateNodes = [];
					let inputType = null;
					let inputNode = null;
					while (currentNode) {
						updateNodes.unshift(currentNode);
						const linkId = currentNode.inputs[0].link;
						if (linkId !== null) {
							const link = app.graph.links[linkId];
							const node = app.graph.getNodeById(link.origin_id);
							const type = node.constructor.type;
							if (type === "Reroute") {
								if (node === this) {
									// We've found a circle
									currentNode.disconnectInput(link.target_slot);
									currentNode = null;
								}
								else {
									// Move the previous node
									currentNode = node;
								}
							} else {
								// We've found the end
								inputNode = currentNode;
								inputType = node.outputs[link.origin_slot]?.type ?? null;
								break;
							}
						} else {
							// This path has no input node
							currentNode = null;
							break;
						}
					}

					// Find all outputs
					const nodes = [this];
					let outputType = null;
					while (nodes.length) {
						currentNode = nodes.pop();
						const outputs = (currentNode.outputs ? currentNode.outputs[0].links : []) || [];
						if (outputs.length) {
							for (const linkId of outputs) {
								const link = app.graph.links[linkId];

								// When disconnecting sometimes the link is still registered
								if (!link) continue;

								const node = app.graph.getNodeById(link.target_id);
								const type = node.constructor.type;

								if (type === "Reroute") {
									// Follow reroute nodes
									nodes.push(node);
									updateNodes.push(node);
								} else {
									// We've found an output
									const nodeOutType = node.inputs && node.inputs[link?.target_slot] && node.inputs[link.target_slot].type ? node.inputs[link.target_slot].type : null;
									if (inputType && nodeOutType !== inputType) {
										// The output doesnt match our input so disconnect it
										node.disconnectInput(link.target_slot);
									} else {
										outputType = nodeOutType;
									}
								}
							}
						} else {
							// No more outputs for this path
						}
					}

					const displayType = inputType || outputType || "*";
					const color = LGraphCanvas.link_type_colors[displayType];

					// Update the types of each node
					for (const node of updateNodes) {
						// If we dont have an input type we are always wildcard but we'll show the output type
						// This lets you change the output link to a different type and all nodes will update
						node.outputs[0].type = inputType || "*";
						node.__outputType = displayType;
						node.outputs[0].name = node.properties.showOutputText ? displayType : "";
						node.size = node.computeSize();
						node.applyOrientation();

						for (const l of node.outputs[0].links || []) {
							const link = app.graph.links[l];
							if (link) {
								link.color = color;
							}
						}
					}

					if (inputNode) {
						const link = app.graph.links[inputNode.inputs[0].link];
						if (link) {
							link.color = color;
						}
					}
				};

				this.clone = function () {
					const cloned = RerouteNode.prototype.clone.apply(this);
					cloned.removeOutput(0);
					cloned.addOutput(this.properties.showOutputText ? "*" : "", "*");
					cloned.size = cloned.computeSize();
					return cloned;
				};

				// This node is purely frontend and does not impact the resulting prompt so should not be serialized
				this.isVirtualNode = true;
			}

			getExtraMenuOptions(_, options) {
				options.unshift(
					{
						content: (this.properties.showOutputText ? "Hide" : "Show") + " Type",
						callback: () => {
							this.properties.showOutputText = !this.properties.showOutputText;
							if (this.properties.showOutputText) {
								this.outputs[0].name = this.__outputType || this.outputs[0].type;
							} else {
								this.outputs[0].name = "";
							}
							this.size = this.computeSize();
							this.applyOrientation();
							app.graph.setDirtyCanvas(true, true);
						},
					},
					{
						content: (RerouteNode.defaultVisibility ? "Hide" : "Show") + " Type By Default",
						callback: () => {
							RerouteNode.setDefaultTextVisibility(!RerouteNode.defaultVisibility);
						},
					},
					{
						// naming is inverted with respect to LiteGraphNode.horizontal
						// LiteGraphNode.horizontal == true means that 
						// each slot in the inputs and outputs are layed out horizontally, 
						// which is the opposite of the visual orientation of the inputs and outputs as a node
						content: "Set " + (this.properties.horizontal ? "Horizontal" : "Vertical"),
						callback: () => {
							this.properties.horizontal = !this.properties.horizontal;
							this.applyOrientation();
						},
					}
				);
			}
			applyOrientation() {
				this.horizontal = this.properties.horizontal;
				if (this.horizontal) {
					// we correct the input position, because LiteGraphNode.horizontal 
					// doesn't account for title presence
					// which reroute nodes don't have
					this.inputs[0].pos = [this.size[0] / 2, 0];
				} else {
					delete this.inputs[0].pos;
				}
				app.graph.setDirtyCanvas(true, true);
			}

			computeSize() {
				return [
					this.properties.showOutputText && this.outputs && this.outputs.length
						? Math.max(75, LiteGraph.NODE_TEXT_SIZE * this.outputs[0].name.length * 0.6 + 40)
						: 75,
					26,
				];
			}

			static setDefaultTextVisibility(visible) {
				RerouteNode.defaultVisibility = visible;
				if (visible) {
					localStorage["Comfy.RerouteNode.DefaultVisibility"] = "true";
				} else {
					delete localStorage["Comfy.RerouteNode.DefaultVisibility"];
				}
			}
		}

		// Load default visibility
		RerouteNode.setDefaultTextVisibility(!!localStorage["Comfy.RerouteNode.DefaultVisibility"]);

		LiteGraph.registerNodeType(
			"Reroute",
			Object.assign(RerouteNode, {
				title_mode: LiteGraph.NO_TITLE,
				title: "Reroute",
				collapsable: false,
			})
		);

		RerouteNode.category = "utils";
	},
});

// import { app } from "../../scripts/app.js";

// Use widget values and dates in output filenames

app.registerExtension({
	name: "Comfy.SaveImageExtraOutput",
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		if (nodeData.name === "SaveImage") {
			const onNodeCreated = nodeType.prototype.onNodeCreated;

         // Simple date formatter
			const parts = {
				d: (d) => d.getDate(),
				M: (d) => d.getMonth() + 1,
				h: (d) => d.getHours(),
				m: (d) => d.getMinutes(),
				s: (d) => d.getSeconds(),
			};
			const format =
				Object.keys(parts)
					.map((k) => k + k + "?")
					.join("|") + "|yyy?y?";

			function formatDate(text, date) {
				return text.replace(new RegExp(format, "g"), function (text) {
					if (text === "yy") return (date.getFullYear() + "").substring(2);
					if (text === "yyyy") return date.getFullYear();
					if (text[0] in parts) {
						const p = parts[text[0]](date);
						return (p + "").padStart(text.length, "0");
					}
					return text;
				});
			}

         // When the SaveImage node is created we want to override the serialization of the output name widget to run our S&R
			nodeType.prototype.onNodeCreated = function () {
				const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

				const widget = this.widgets.find((w) => w.name === "filename_prefix");
				widget.serializeValue = () => {
					return widget.value.replace(/%([^%]+)%/g, function (match, text) {
						const split = text.split(".");
						if (split.length !== 2) {
                     // Special handling for dates
							if (split[0].startsWith("date:")) {
								return formatDate(split[0].substring(5), new Date());
							}

							if (text !== "width" && text !== "height") {
								// Dont warn on standard replacements
								console.warn("Invalid replacement pattern", text);
							}
							return match;
						}

						// Find node with matching S&R property name
						let nodes = app.graph._nodes.filter((n) => n.properties?.["Node name for S&R"] === split[0]);
						// If we cant, see if there is a node with that title
						if (!nodes.length) {
							nodes = app.graph._nodes.filter((n) => n.title === split[0]);
						}
						if (!nodes.length) {
							console.warn("Unable to find node", split[0]);
							return match;
						}

						if (nodes.length > 1) {
							console.warn("Multiple nodes matched", split[0], "using first match");
						}

						const node = nodes[0];

						const widget = node.widgets?.find((w) => w.name === split[1]);
						if (!widget) {
							console.warn("Unable to find widget", split[1], "on node", split[0], node);
							return match;
						}

						return ((widget.value ?? "") + "").replaceAll(/\/|\\/g, "_");
					});
				};

				return r;
			};
		} else {
         // When any other node is created add a property to alias the node
			const onNodeCreated = nodeType.prototype.onNodeCreated;
			nodeType.prototype.onNodeCreated = function () {
				const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

				if (!this.properties || !("Node name for S&R" in this.properties)) {
					this.addProperty("Node name for S&R", this.constructor.type, "string");
				}

				return r;
			};
		}
	},
});

// import {app} from "../../scripts/app.js";

app.registerExtension({
	name: "Comfy.Keybinds",
	init() {
		const keybindListener = function (event) {
			const modifierPressed = event.ctrlKey || event.metaKey;

			// Queue prompt using ctrl or command + enter
			if (modifierPressed && event.key === "Enter") {
				app.queuePrompt(event.shiftKey ? -1 : 0).then();
				return;
			}

			const target = event.composedPath()[0];
			if (["INPUT", "TEXTAREA"].includes(target.tagName)) {
				return;
			}

			const modifierKeyIdMap = {
				s: "#comfy-save-button",
				o: "#comfy-file-input",
				Backspace: "#comfy-clear-button",
				Delete: "#comfy-clear-button",
				d: "#comfy-load-default-button",
			};

			const modifierKeybindId = modifierKeyIdMap[event.key];
			if (modifierPressed && modifierKeybindId) {
				event.preventDefault();

				const elem = document.querySelector(modifierKeybindId);
				elem.click();
				return;
			}

			// Finished Handling all modifier keybinds, now handle the rest
			if (event.ctrlKey || event.altKey || event.metaKey) {
				return;
			}

			// Close out of modals using escape
			if (event.key === "Escape") {
				const modals = document.querySelectorAll(".comfy-modal");
				const modal = Array.from(modals).find(modal => window.getComputedStyle(modal).getPropertyValue("display") !== "none");
				if (modal) {
					modal.style.display = "none";
				}

				[...document.querySelectorAll("dialog")].forEach(d => {
					d.close();
				});
			}

			const keyIdMap = {
				q: "#comfy-view-queue-button",
				h: "#comfy-view-history-button",
				r: "#comfy-refresh-button",
			};

			const buttonId = keyIdMap[event.key];
			if (buttonId) {
				const button = document.querySelector(buttonId);
				button.click();
			}
		}

		window.addEventListener("keydown", keybindListener, true);
	}
});

// import {app} from "../../scripts/app.js";
// import {$el} from "../../scripts/ui.js";

// Manage color palettes

const colorPalettes = {
	"dark": {
		"id": "dark",
		"name": "Dark (Default)",
		"colors": {
			"node_slot": {
				"CLIP": "#FFD500", // bright yellow
				"CLIP_VISION": "#A8DADC", // light blue-gray
				"CLIP_VISION_OUTPUT": "#ad7452", // rusty brown-orange
				"CONDITIONING": "#FFA931", // vibrant orange-yellow
				"CONTROL_NET": "#6EE7B7", // soft mint green
				"IMAGE": "#64B5F6", // bright sky blue
				"LATENT": "#FF9CF9", // light pink-purple
				"MASK": "#81C784", // muted green
				"MODEL": "#B39DDB", // light lavender-purple
				"STYLE_MODEL": "#C2FFAE", // light green-yellow
				"VAE": "#FF6E6E", // bright red
				"TAESD": "#DCC274", // cheesecake
			},
			"litegraph_base": {
				"BACKGROUND_IMAGE": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAQBJREFUeNrs1rEKwjAUhlETUkj3vP9rdmr1Ysammk2w5wdxuLgcMHyptfawuZX4pJSWZTnfnu/lnIe/jNNxHHGNn//HNbbv+4dr6V+11uF527arU7+u63qfa/bnmh8sWLBgwYJlqRf8MEptXPBXJXa37BSl3ixYsGDBMliwFLyCV/DeLIMFCxYsWLBMwSt4Be/NggXLYMGCBUvBK3iNruC9WbBgwYJlsGApeAWv4L1ZBgsWLFiwYJmCV/AK3psFC5bBggULloJX8BpdwXuzYMGCBctgwVLwCl7Be7MMFixYsGDBsu8FH1FaSmExVfAxBa/gvVmwYMGCZbBg/W4vAQYA5tRF9QYlv/QAAAAASUVORK5CYII=",
				"CLEAR_BACKGROUND_COLOR": "#222",
				"NODE_TITLE_COLOR": "#999",
				"NODE_SELECTED_TITLE_COLOR": "#FFF",
				"NODE_TEXT_SIZE": 14,
				"NODE_TEXT_COLOR": "#AAA",
				"NODE_SUBTEXT_SIZE": 12,
				"NODE_DEFAULT_COLOR": "#333",
				"NODE_DEFAULT_BGCOLOR": "#353535",
				"NODE_DEFAULT_BOXCOLOR": "#666",
				"NODE_DEFAULT_SHAPE": "box",
				"NODE_BOX_OUTLINE_COLOR": "#FFF",
				"DEFAULT_SHADOW_COLOR": "rgba(0,0,0,0.5)",
				"DEFAULT_GROUP_FONT": 24,

				"WIDGET_BGCOLOR": "#222",
				"WIDGET_OUTLINE_COLOR": "#666",
				"WIDGET_TEXT_COLOR": "#DDD",
				"WIDGET_SECONDARY_TEXT_COLOR": "#999",

				"LINK_COLOR": "#9A9",
				"EVENT_LINK_COLOR": "#A86",
				"CONNECTING_LINK_COLOR": "#AFA",
			},
			"comfy_base": {
				"fg-color": "#fff",
				"bg-color": "#202020",
				"comfy-menu-bg": "#353535",
				"comfy-input-bg": "#222",
				"input-text": "#ddd",
				"descrip-text": "#999",
				"drag-text": "#ccc",
				"error-text": "#ff4444",
				"border-color": "#4e4e4e",
				"tr-even-bg-color": "#222",
				"tr-odd-bg-color": "#353535",
			}
		},
	},
	"light": {
		"id": "light",
		"name": "Light",
		"colors": {
			"node_slot": {
				"CLIP": "#FFA726", // orange
				"CLIP_VISION": "#5C6BC0", // indigo
				"CLIP_VISION_OUTPUT": "#8D6E63", // brown
				"CONDITIONING": "#EF5350", // red
				"CONTROL_NET": "#66BB6A", // green
				"IMAGE": "#42A5F5", // blue
				"LATENT": "#AB47BC", // purple
				"MASK": "#9CCC65", // light green
				"MODEL": "#7E57C2", // deep purple
				"STYLE_MODEL": "#D4E157", // lime
				"VAE": "#FF7043", // deep orange
			},
			"litegraph_base": {
				"BACKGROUND_IMAGE": "data:image/gif;base64,R0lGODlhZABkALMAAAAAAP///+vr6+rq6ujo6Ofn5+bm5uXl5d3d3f///wAAAAAAAAAAAAAAAAAAAAAAACH5BAEAAAkALAAAAABkAGQAAAT/UMhJq7046827HkcoHkYxjgZhnGG6si5LqnIM0/fL4qwwIMAg0CAsEovBIxKhRDaNy2GUOX0KfVFrssrNdpdaqTeKBX+dZ+jYvEaTf+y4W66mC8PUdrE879f9d2mBeoNLfH+IhYBbhIx2jkiHiomQlGKPl4uZe3CaeZifnnijgkESBqipqqusra6vsLGys62SlZO4t7qbuby7CLa+wqGWxL3Gv3jByMOkjc2lw8vOoNSi0czAncXW3Njdx9Pf48/Z4Kbbx+fQ5evZ4u3k1fKR6cn03vHlp7T9/v8A/8Gbp4+gwXoFryXMB2qgwoMMHyKEqA5fxX322FG8tzBcRnMW/zlulPbRncmQGidKjMjyYsOSKEF2FBlJQMCbOHP6c9iSZs+UnGYCdbnSo1CZI5F64kn0p1KnTH02nSoV3dGTV7FFHVqVq1dtWcMmVQZTbNGu72zqXMuW7danVL+6e4t1bEy6MeueBYLXrNO5Ze36jQtWsOG97wIj1vt3St/DjTEORss4nNq2mDP3e7w4r1bFkSET5hy6s2TRlD2/mSxXtSHQhCunXo26NevCpmvD/UU6tuullzULH76q92zdZG/Ltv1a+W+osI/nRmyc+fRi1Xdbh+68+0vv10dH3+77KD/i6IdnX669/frn5Zsjh4/2PXju8+8bzc9/6fj27LFnX11/+IUnXWl7BJfegm79FyB9JOl3oHgSklefgxAC+FmFGpqHIYcCfkhgfCohSKKJVo044YUMttggiBkmp6KFXw1oII24oYhjiDByaKOOHcp3Y5BD/njikSkO+eBREQAAOw==",
				"CLEAR_BACKGROUND_COLOR": "lightgray",
				"NODE_TITLE_COLOR": "#222",
				"NODE_SELECTED_TITLE_COLOR": "#000",
				"NODE_TEXT_SIZE": 14,
				"NODE_TEXT_COLOR": "#444",
				"NODE_SUBTEXT_SIZE": 12,
				"NODE_DEFAULT_COLOR": "#F7F7F7",
				"NODE_DEFAULT_BGCOLOR": "#F5F5F5",
				"NODE_DEFAULT_BOXCOLOR": "#CCC",
				"NODE_DEFAULT_SHAPE": "box",
				"NODE_BOX_OUTLINE_COLOR": "#000",
				"DEFAULT_SHADOW_COLOR": "rgba(0,0,0,0.1)",
				"DEFAULT_GROUP_FONT": 24,

				"WIDGET_BGCOLOR": "#D4D4D4",
				"WIDGET_OUTLINE_COLOR": "#999",
				"WIDGET_TEXT_COLOR": "#222",
				"WIDGET_SECONDARY_TEXT_COLOR": "#555",

				"LINK_COLOR": "#4CAF50",
				"EVENT_LINK_COLOR": "#FF9800",
				"CONNECTING_LINK_COLOR": "#2196F3",
			},
			"comfy_base": {
				"fg-color": "#222",
				"bg-color": "#DDD",
				"comfy-menu-bg": "#F5F5F5",
				"comfy-input-bg": "#C9C9C9",
				"input-text": "#222",
				"descrip-text": "#444",
				"drag-text": "#555",
				"error-text": "#F44336",
				"border-color": "#888",
				"tr-even-bg-color": "#f9f9f9",
				"tr-odd-bg-color": "#fff",
			}
		},
	},
	"solarized": {
		"id": "solarized",
		"name": "Solarized",
		"colors": {
			"node_slot": {
				"CLIP": "#2AB7CA", // light blue
				"CLIP_VISION": "#6c71c4", // blue violet
				"CLIP_VISION_OUTPUT": "#859900", // olive green
				"CONDITIONING": "#d33682", // magenta
				"CONTROL_NET": "#d1ffd7", // light mint green
				"IMAGE": "#5940bb", // deep blue violet
				"LATENT": "#268bd2", // blue
				"MASK": "#CCC9E7", // light purple-gray
				"MODEL": "#dc322f", // red
				"STYLE_MODEL": "#1a998a", // teal
				"UPSCALE_MODEL": "#054A29", // dark green
				"VAE": "#facfad", // light pink-orange
			},
			"litegraph_base": {
				"NODE_TITLE_COLOR": "#fdf6e3", // Base3
				"NODE_SELECTED_TITLE_COLOR": "#A9D400",
				"NODE_TEXT_SIZE": 14,
				"NODE_TEXT_COLOR": "#657b83", // Base00
				"NODE_SUBTEXT_SIZE": 12,
				"NODE_DEFAULT_COLOR": "#094656",
				"NODE_DEFAULT_BGCOLOR": "#073642", // Base02
				"NODE_DEFAULT_BOXCOLOR": "#839496", // Base0
				"NODE_DEFAULT_SHAPE": "box",
				"NODE_BOX_OUTLINE_COLOR": "#fdf6e3", // Base3
				"DEFAULT_SHADOW_COLOR": "rgba(0,0,0,0.5)",
				"DEFAULT_GROUP_FONT": 24,

				"WIDGET_BGCOLOR": "#002b36", // Base03
				"WIDGET_OUTLINE_COLOR": "#839496", // Base0
				"WIDGET_TEXT_COLOR": "#fdf6e3", // Base3
				"WIDGET_SECONDARY_TEXT_COLOR": "#93a1a1", // Base1

				"LINK_COLOR": "#2aa198", // Solarized Cyan
				"EVENT_LINK_COLOR": "#268bd2", // Solarized Blue
				"CONNECTING_LINK_COLOR": "#859900", // Solarized Green
			},
			"comfy_base": {
				"fg-color": "#fdf6e3", // Base3
				"bg-color": "#002b36", // Base03
				"comfy-menu-bg": "#073642", // Base02
				"comfy-input-bg": "#002b36", // Base03
				"input-text": "#93a1a1", // Base1
				"descrip-text": "#586e75", // Base01
				"drag-text": "#839496", // Base0
				"error-text": "#dc322f", // Solarized Red
				"border-color": "#657b83", // Base00
				"tr-even-bg-color": "#002b36",
				"tr-odd-bg-color": "#073642",
			}
		},
	}
};

id = "Comfy.ColorPalette";
const idCustomColorPalettes = "Comfy.CustomColorPalettes";
const defaultColorPaletteId = "dark";
const els = {}
// const ctxMenu = LiteGraph.ContextMenu;
app.registerExtension({
	name: id,
	addCustomNodeDefs(node_defs) {
		const sortObjectKeys = (unordered) => {
			return Object.keys(unordered).sort().reduce((obj, key) => {
				obj[key] = unordered[key];
				return obj;
			}, {});
		};

		function getSlotTypes() {
			var types = [];

			const defs = node_defs;
			for (const nodeId in defs) {
				const nodeData = defs[nodeId];

				var inputs = nodeData["input"]["required"];
				if (nodeData["input"]["optional"] !== undefined) {
					inputs = Object.assign({}, nodeData["input"]["required"], nodeData["input"]["optional"])
				}

				for (const inputName in inputs) {
					const inputData = inputs[inputName];
					const type = inputData[0];

					if (!Array.isArray(type)) {
						types.push(type);
					}
				}

				for (const o in nodeData["output"]) {
					const output = nodeData["output"][o];
					types.push(output);
				}
			}

			return types;
		}

		function completeColorPalette(colorPalette) {
			var types = getSlotTypes();

			for (const type of types) {
				if (!colorPalette.colors.node_slot[type]) {
					colorPalette.colors.node_slot[type] = "";
				}
			}

			colorPalette.colors.node_slot = sortObjectKeys(colorPalette.colors.node_slot);

			return colorPalette;
		}

		const getColorPaletteTemplate = async () => {
			let colorPalette = {
				"id": "my_color_palette_unique_id",
				"name": "My Color Palette",
				"colors": {
					"node_slot": {},
					"litegraph_base": {},
					"comfy_base": {}
				}
			};

			// Copy over missing keys from default color palette
			const defaultColorPalette = colorPalettes[defaultColorPaletteId];
			for (const key in defaultColorPalette.colors.litegraph_base) {
				if (!colorPalette.colors.litegraph_base[key]) {
					colorPalette.colors.litegraph_base[key] = "";
				}
			}
			for (const key in defaultColorPalette.colors.comfy_base) {
				if (!colorPalette.colors.comfy_base[key]) {
					colorPalette.colors.comfy_base[key] = "";
				}
			}

			return completeColorPalette(colorPalette);
		};

		const getCustomColorPalettes = () => {
			return app.ui.settings.getSettingValue(idCustomColorPalettes, {});
		};

		const setCustomColorPalettes = (customColorPalettes) => {
			return app.ui.settings.setSettingValue(idCustomColorPalettes, customColorPalettes);
		};

		const addCustomColorPalette = async (colorPalette) => {
			if (typeof (colorPalette) !== "object") {
				alert("Invalid color palette.");
				return;
			}

			if (!colorPalette.id) {
				alert("Color palette missing id.");
				return;
			}

			if (!colorPalette.name) {
				alert("Color palette missing name.");
				return;
			}

			if (!colorPalette.colors) {
				alert("Color palette missing colors.");
				return;
			}

			if (colorPalette.colors.node_slot && typeof (colorPalette.colors.node_slot) !== "object") {
				alert("Invalid color palette colors.node_slot.");
				return;
			}

			const customColorPalettes = getCustomColorPalettes();
			customColorPalettes[colorPalette.id] = colorPalette;
			setCustomColorPalettes(customColorPalettes);

			for (const option of els.select.childNodes) {
				if (option.value === "custom_" + colorPalette.id) {
					els.select.removeChild(option);
				}
			}

			els.select.append($el("option", {
				textContent: colorPalette.name + " (custom)",
				value: "custom_" + colorPalette.id,
				selected: true
			}));

			setColorPalette("custom_" + colorPalette.id);
			await loadColorPalette(colorPalette);
		};

		const deleteCustomColorPalette = async (colorPaletteId) => {
			const customColorPalettes = getCustomColorPalettes();
			delete customColorPalettes[colorPaletteId];
			setCustomColorPalettes(customColorPalettes);

			for (const option of els.select.childNodes) {
				if (option.value === defaultColorPaletteId) {
					option.selected = true;
				}

				if (option.value === "custom_" + colorPaletteId) {
					els.select.removeChild(option);
				}
			}

			setColorPalette(defaultColorPaletteId);
			await loadColorPalette(getColorPalette());
		};

		const loadColorPalette = async (colorPalette) => {
			colorPalette = await completeColorPalette(colorPalette);
			if (colorPalette.colors) {
				// Sets the colors of node slots and links
				if (colorPalette.colors.node_slot) {
					Object.assign(app.canvas.default_connection_color_byType, colorPalette.colors.node_slot);
					Object.assign(LGraphCanvas.link_type_colors, colorPalette.colors.node_slot);
				}
				// Sets the colors of the LiteGraph objects
				if (colorPalette.colors.litegraph_base) {
					// Everything updates correctly in the loop, except the Node Title and Link Color for some reason
					app.canvas.node_title_color = colorPalette.colors.litegraph_base.NODE_TITLE_COLOR;
					app.canvas.default_link_color = colorPalette.colors.litegraph_base.LINK_COLOR;

					for (const key in colorPalette.colors.litegraph_base) {
						if (colorPalette.colors.litegraph_base.hasOwnProperty(key) && LiteGraph.hasOwnProperty(key)) {
							LiteGraph[key] = colorPalette.colors.litegraph_base[key];
						}
					}
				}
				// Sets the color of ComfyUI elements
				if (colorPalette.colors.comfy_base) {
					const rootStyle = document.documentElement.style;
					for (const key in colorPalette.colors.comfy_base) {
						rootStyle.setProperty('--' + key, colorPalette.colors.comfy_base[key]);
					}
				}
				app.canvas.draw(true, true);
			}
		};

		const getColorPalette = (colorPaletteId) => {
			if (!colorPaletteId) {
				colorPaletteId = app.ui.settings.getSettingValue(id, defaultColorPaletteId);
			}

			if (colorPaletteId.startsWith("custom_")) {
				colorPaletteId = colorPaletteId.substr(7);
				let customColorPalettes = getCustomColorPalettes();
				if (customColorPalettes[colorPaletteId]) {
					return customColorPalettes[colorPaletteId];
				}
			}

			return colorPalettes[colorPaletteId];
		};

		const setColorPalette = (colorPaletteId) => {
			app.ui.settings.setSettingValue(id, colorPaletteId);
		};

		const fileInput = $el("input", {
			type: "file",
			accept: ".json",
			style: {display: "none"},
			parent: document.body,
			onchange: () => {
				const file = fileInput.files[0];
				if (file.type === "application/json" || file.name.endsWith(".json")) {
					const reader = new FileReader();
					reader.onload = async () => {
						await addCustomColorPalette(JSON.parse(reader.result));
					};
					reader.readAsText(file);
				}
			},
		});

		app.ui.settings.addSetting({
			id,
			name: "Color Palette",
			type: (name, setter, value) => {
				const options = [
					...Object.values(colorPalettes).map(c=> $el("option", {
						textContent: c.name,
						value: c.id,
						selected: c.id === value
					})),
					...Object.values(getCustomColorPalettes()).map(c=>$el("option", {
						textContent: `${c.name} (custom)`,
						value: `custom_${c.id}`,
						selected: `custom_${c.id}` === value
					}))	,
				];

				els.select = $el("select", {
					style: {
						marginBottom: "0.15rem",
						width: "100%",
					},
					onchange: (e) => {
						setter(e.target.value);
					}
				}, options)

				return $el("tr", [
					$el("td", [
						$el("label", {
							for: id.replaceAll(".", "-"),
							textContent: "Color palette",
						}),
					]),
					$el("td", [
						els.select,
						$el("div", {
							style: {
								display: "grid",
								gap: "4px",
								gridAutoFlow: "column",
							},
						}, [
							$el("input", {
								type: "button",
								value: "Export",
								onclick: async () => {
									const colorPaletteId = app.ui.settings.getSettingValue(id, defaultColorPaletteId);
									const colorPalette = await completeColorPalette(getColorPalette(colorPaletteId));
									const json = JSON.stringify(colorPalette, null, 2); // convert the data to a JSON string
									const blob = new Blob([json], {type: "application/json"});
									const url = URL.createObjectURL(blob);
									const a = $el("a", {
										href: url,
										download: colorPaletteId + ".json",
										style: {display: "none"},
										parent: document.body,
									});
									a.click();
									setTimeout(function () {
										a.remove();
										window.URL.revokeObjectURL(url);
									}, 0);
								},
							}),
							$el("input", {
								type: "button",
								value: "Import",
								onclick: () => {
									fileInput.click();
								}
							}),
							$el("input", {
								type: "button",
								value: "Template",
								onclick: async () => {
									const colorPalette = await getColorPaletteTemplate();
									const json = JSON.stringify(colorPalette, null, 2); // convert the data to a JSON string
									const blob = new Blob([json], {type: "application/json"});
									const url = URL.createObjectURL(blob);
									const a = $el("a", {
										href: url,
										download: "color_palette.json",
										style: {display: "none"},
										parent: document.body,
									});
									a.click();
									setTimeout(function () {
										a.remove();
										window.URL.revokeObjectURL(url);
									}, 0);
								}
							}),
							$el("input", {
								type: "button",
								value: "Delete",
								onclick: async () => {
									let colorPaletteId = app.ui.settings.getSettingValue(id, defaultColorPaletteId);

									if (colorPalettes[colorPaletteId]) {
										alert("You cannot delete a built-in color palette.");
										return;
									}

									if (colorPaletteId.startsWith("custom_")) {
										colorPaletteId = colorPaletteId.substr(7);
									}

									await deleteCustomColorPalette(colorPaletteId);
								}
							}),
						]),
					]),
				])
			},
			defaultValue: defaultColorPaletteId,
			async onChange(value) {
				if (!value) {
					return;
				}

				let palette = colorPalettes[value];
				if (palette) {
					await loadColorPalette(palette);
				} else if (value.startsWith("custom_")) {
					value = value.substr(7);
					let customColorPalettes = getCustomColorPalettes();
					if (customColorPalettes[value]) {
						palette = customColorPalettes[value];
						await loadColorPalette(customColorPalettes[value]);
					}
				}

				let {BACKGROUND_IMAGE, CLEAR_BACKGROUND_COLOR} = palette.colors.litegraph_base;
				if (BACKGROUND_IMAGE === undefined || CLEAR_BACKGROUND_COLOR === undefined) {
					const base = colorPalettes["dark"].colors.litegraph_base;
					BACKGROUND_IMAGE = base.BACKGROUND_IMAGE;
					CLEAR_BACKGROUND_COLOR = base.CLEAR_BACKGROUND_COLOR;
				}
				app.canvas.updateBackground(BACKGROUND_IMAGE, CLEAR_BACKGROUND_COLOR);
			},
		});
	},
});

// import { app } from "../../scripts/app.js";

// Adds an upload button to the nodes

app.registerExtension({
	name: "Comfy.UploadImage",
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		if (nodeData.name === "LoadImage" || nodeData.name === "LoadImageMask") {
			nodeData.input.required.upload = ["IMAGEUPLOAD"];
		}
	},
});

// import {app} from "../../scripts/app.js";
// import {ComfyWidgets} from "../../scripts/widgets.js";
// Node that add notes to your project

app.registerExtension({
    name: "Comfy.NoteNode",
    registerCustomNodes() {
        class NoteNode {
            color=LGraphCanvas.node_colors.yellow.color;
            bgcolor=LGraphCanvas.node_colors.yellow.bgcolor;
            groupcolor = LGraphCanvas.node_colors.yellow.groupcolor;
            constructor() {
                if (!this.properties) {
                    this.properties = {};
                    this.properties.text="";
                }

                ComfyWidgets.STRING(this, "", ["", {default:this.properties.text, multiline: true}], app)

                this.serialize_widgets = true;
                this.isVirtualNode = true;

            }


        }

        // Load default visibility

        LiteGraph.registerNodeType(
            "Note",
            Object.assign(NoteNode, {
                title_mode: LiteGraph.NORMAL_TITLE,
                title: "Note",
                collapsable: true,
            })
        );

        NoteNode.category = "utils";
    },
});

// import { app } from "../../scripts/app.js";
// import { ComfyDialog, $el } from "../../scripts/ui.js";

// Adds the ability to save and add multiple nodes as a template
// To save:
// Select multiple nodes (ctrl + drag to select a region or ctrl+click individual nodes)
// Right click the canvas
// Save Node Template -> give it a name
//
// To add:
// Right click the canvas
// Node templates -> click the one to add
//
// To delete/rename:
// Right click the canvas
// Node templates -> Manage

id = "Comfy.NodeTemplates";

class ManageTemplates extends ComfyDialog {
	constructor() {
		super();
		this.element.classList.add("comfy-manage-templates");
		this.templates = this.load();
	}

	createButtons() {
		const btns = super.createButtons();
		btns[0].textContent = "Cancel";
		btns.unshift(
			$el("button", {
				type: "button",
				textContent: "Save",
				onclick: () => this.save(),
			})
		);
		return btns;
	}

	load() {
		const templates = localStorage.getItem(id);
		if (templates) {
			return JSON.parse(templates);
		} else {
			return [];
		}
	}

	save() {
		// Find all visible inputs and save them as our new list
		const inputs = this.element.querySelectorAll("input");
		const updated = [];

		for (let i = 0; i < inputs.length; i++) {
			const input = inputs[i];
			if (input.parentElement.style.display !== "none") {
				const t = this.templates[i];
				t.name = input.value.trim() || input.getAttribute("data-name");
				updated.push(t);
			}
		}

		this.templates = updated;
		this.store();
		this.close();
	}

	store() {
		localStorage.setItem(id, JSON.stringify(this.templates));
	}

	show() {
		// Show list of template names + delete button
		super.show(
			$el(
				"div",
				{
					style: {
						display: "grid",
						gridTemplateColumns: "1fr auto",
						gap: "5px",
					},
				},
				this.templates.flatMap((t) => {
					let nameInput;
					return [
						$el(
							"label",
							{
								textContent: "Name: ",
							},
							[
								$el("input", {
									value: t.name,
									dataset: { name: t.name },
									$: (el) => (nameInput = el),
								}),
							]
						),
						$el("button", {
							textContent: "Delete",
							style: {
								fontSize: "12px",
								color: "red",
								fontWeight: "normal",
							},
							onclick: (e) => {
								nameInput.value = "";
								e.target.style.display = "none";
								e.target.previousElementSibling.style.display = "none";
							},
						}),
					];
				})
			)
		);
	}
}

app.registerExtension({
	name: id,
	setup() {
		const manage = new ManageTemplates();

		const clipboardAction = (cb) => {
			// We use the clipboard functions but dont want to overwrite the current user clipboard
			// Restore it after we've run our callback
			const old = localStorage.getItem("litegrapheditor_clipboard");
			cb();
			localStorage.setItem("litegrapheditor_clipboard", old);
		};

		const orig = LGraphCanvas.prototype.getCanvasMenuOptions;
		LGraphCanvas.prototype.getCanvasMenuOptions = function () {
			const options = orig.apply(this, arguments);

			options.push(null);
			options.push({
				content: `Save Selected as Template`,
				disabled: !Object.keys(app.canvas.selected_nodes || {}).length,
				callback: () => {
					const name = prompt("Enter name");
					if (!name || !name.trim()) return;

					clipboardAction(() => {
						app.canvas.copyToClipboard();
						manage.templates.push({
							name,
							data: localStorage.getItem("litegrapheditor_clipboard"),
						});
						manage.store();
					});
				},
			});

			// Map each template to a menu item
			const subItems = manage.templates.map((t) => ({
				content: t.name,
				callback: () => {
					clipboardAction(() => {
						localStorage.setItem("litegrapheditor_clipboard", t.data);
						app.canvas.pasteFromClipboard();
					});
				},
			}));

			if (subItems.length) {
				subItems.push(null, {
					content: "Manage",
					callback: () => manage.show(),
				});

				options.push({
					content: "Node Templates",
					submenu: {
						options: subItems,
					},
				});
			}

			return options;
		};
	},
});

// import { app } from "../../scripts/app.js";

// Allows you to edit the attention weight by holding ctrl (or cmd) and using the up/down arrow keys

app.registerExtension({
    name: "Comfy.EditAttention",
    init() {
        const editAttentionDelta = app.ui.settings.addSetting({
            id: "Comfy.EditAttention.Delta",
            name: "Ctrl+up/down precision",
            type: "slider",
            attrs: {
                min: 0.01,
                max: 0.5,
                step: 0.01,
            },
            defaultValue: 0.05,
        });

        function incrementWeight(weight, delta) {
            const floatWeight = parseFloat(weight);
            if (isNaN(floatWeight)) return weight;
            const newWeight = floatWeight + delta;
            if (newWeight < 0) return "0";
            return String(Number(newWeight.toFixed(10)));
        }

        function findNearestEnclosure(text, cursorPos) {
            let start = cursorPos, end = cursorPos;
            let openCount = 0, closeCount = 0;

            // Find opening parenthesis before cursor
            while (start >= 0) {
                start--;
                if (text[start] === "(" && openCount === closeCount) break;
                if (text[start] === "(") openCount++;
                if (text[start] === ")") closeCount++;
            }
            if (start < 0) return false;

            openCount = 0;
            closeCount = 0;

            // Find closing parenthesis after cursor
            while (end < text.length) {
                if (text[end] === ")" && openCount === closeCount) break;
                if (text[end] === "(") openCount++;
                if (text[end] === ")") closeCount++;
                end++;
            }
            if (end === text.length) return false;

            return { start: start + 1, end: end };
        }

        function addWeightToParentheses(text) {
            const parenRegex = /^\((.*)\)$/;
            const parenMatch = text.match(parenRegex);

            const floatRegex = /:([+-]?(\d*\.)?\d+([eE][+-]?\d+)?)/;
            const floatMatch = text.match(floatRegex);

            if (parenMatch && !floatMatch) {
                return `(${parenMatch[1]}:1.0)`;
            } else {
                return text;
            }
        };

        function editAttention(event) {
            const inputField = event.composedPath()[0];
            const delta = parseFloat(editAttentionDelta.value);

            if (inputField.tagName !== "TEXTAREA") return;
            if (!(event.key === "ArrowUp" || event.key === "ArrowDown")) return;
            if (!event.ctrlKey && !event.metaKey) return;

            event.preventDefault();

            let start = inputField.selectionStart;
            let end = inputField.selectionEnd;
            let selectedText = inputField.value.substring(start, end);

            // If there is no selection, attempt to find the nearest enclosure, or select the current word
            if (!selectedText) {
                const nearestEnclosure = findNearestEnclosure(inputField.value, start);
                if (nearestEnclosure) {
                    start = nearestEnclosure.start;
                    end = nearestEnclosure.end;
                    selectedText = inputField.value.substring(start, end);
                } else {
                    // Select the current word, find the start and end of the word
                    const delimiters = " .,\\/!?%^*;:{}=-_`~()\r\n\t";
                    
                    while (!delimiters.includes(inputField.value[start - 1]) && start > 0) {
                        start--;
                    }
                    
                    while (!delimiters.includes(inputField.value[end]) && end < inputField.value.length) {
                        end++;
                    }

                    selectedText = inputField.value.substring(start, end);
                    if (!selectedText) return;
                }
            }

            // If the selection ends with a space, remove it
            if (selectedText[selectedText.length - 1] === " ") {
                selectedText = selectedText.substring(0, selectedText.length - 1);
                end -= 1;
            }

            // If there are parentheses left and right of the selection, select them
            if (inputField.value[start - 1] === "(" && inputField.value[end] === ")") {
                start -= 1;
                end += 1;
                selectedText = inputField.value.substring(start, end);
            }

            // If the selection is not enclosed in parentheses, add them
            if (selectedText[0] !== "(" || selectedText[selectedText.length - 1] !== ")") {
                selectedText = `(${selectedText})`;
            }

            // If the selection does not have a weight, add a weight of 1.0
            selectedText = addWeightToParentheses(selectedText);

            // Increment the weight
            const weightDelta = event.key === "ArrowUp" ? delta : -delta;
            const updatedText = selectedText.replace(/\((.*):(\d+(?:\.\d+)?)\)/, (match, text, weight) => {
                weight = incrementWeight(weight, weightDelta);
                if (weight == 1) {
                    return text;
                } else {
                    return `(${text}:${weight})`;
                }
            });

            inputField.setRangeText(updatedText, start, end, "select");
        }
        window.addEventListener("keydown", editAttention);
    },
});


