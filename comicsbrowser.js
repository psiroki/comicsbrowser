window.comicsbrowser = (function(oldPub) {
	if(typeof oldPub === "object" && typeof oldPub.shutdown === "function")
		oldPub.shutdown();
	var efn = function() { };
	var pub = { };
	var console = window.console || { error: efn, warn: efn, log: efn };
	var destructors = [];

	function extendString(s) {
		return {
			endOf: function(search, position) {
				var p = s.indexOf(search, position);
				if(p >= 0)
					return p+search.length;
				return -1;
			},
			endsWith: function(suffix) {
				return s.substring(s.length-suffix.length) === suffix;
			}
		};
	};

	function x(o) {
		if(typeof o === "string" || o instanceof String)
			return extendString(o.valueOf());
		return o;
	};

	var scriptTag = null;

	Array.prototype.slice.call(document.getElementsByTagName("script")).forEach(function(e) {
		var src = e.src;
		if(typeof src === "string" && x(src).endsWith("/comicsbrowser.js"))
			scriptTag = e;
	});

	destructors.push(function() {
		if(scriptTag !== null && scriptTag.parentNode !== null)
			scriptTag.parentNode.removeChild(scriptTag);
	});

	var stripClasses = "img-fluid item-comic-image";
	var secondaryStripClasses = "img-comic-container";
	function quotedImageUrlFromHtml(html) {
		var stripClass = "class=\""+stripClasses+"\"";
		var p = html.indexOf(stripClass);
		if(p < 0) {
			stripClass = "class=\""+secondaryStripClasses+"\"";
			p = html.indexOf(stripClass);
		}
		var p2 = html.indexOf("<img", p);
		var src = x(html).endOf("src=", p2);
		var quot = html.charAt(src);
		var srcEnd = html.indexOf(quot, src+1)+1;
		return html.substring(src, srcEnd);
	}

	function validOrNull(state) {
		if(typeof state !== "string")
			return null;
		if((quotedImageUrlFromHtml(state).replace(/['"]/g, "") || "") === "")
			return null;
		return state;
	}

	pub.imageFromHtml = function(html) {
		var qurl = quotedImageUrlFromHtml(html);
		var imgHtml = "<img src="+qurl+"/>";
		var div = document.createElement("div");
		div.innerHTML = imgHtml;
		var img = div.firstChild;
		div.removeChild(img);
		return img;
	};

	var linkClassLookup = { prev: "control-nav-older", next: "control-nav-newer" };
	var secondaryClassLookup = { prev: "nav-comic nav-left", next: "nav-comic nav-right" };
	pub.linkFromHtml = function(html, direction) {
		var linkClass = linkClassLookup[direction] || direction;
		var secondaryLinkClass = secondaryClassLookup[direction];
		var p = html.indexOf("class=\""+linkClass+"\"");
		if(p < 0) {
			if(secondaryLinkClass)
				p = html.indexOf("class=\""+secondaryLinkClass+"\"");
			if(p < 0)
				return null;
		}
		var p2 = html.indexOf("<", p);
		if(p2 < 0 || !/^<a\s$/g.test(html.substring(p2, p2+3)))
			return null;
		var src = x(html).endOf("href=", p2);
		if(src < 0)
			return null;
		var quot = html.charAt(src);
		var srcEnd = html.indexOf(quot, src+1);
		if(srcEnd < 0)
			return null;
		++srcEnd;
		var imgHtml = "<a href="+html.substring(src, srcEnd)+">foo</a>";
		var div = document.createElement("div");
		div.innerHTML = imgHtml;
		var a = div.firstChild;
		return a.href === "null" ? null : a.href;
	};

	pub.titleFromHtml = function(html) {
		var ts = x(html).endOf("<title>");
		var te = html.indexOf("</title>");
		var div = document.createElement("div");
		div.innerHTML = html.substring(ts, te);
		return div.innerText;
	};

	pub.compactHtml = function(html) {
		var div = document.createElement("div");
		var title = document.createElement("title");
		title.innerText = pub.titleFromHtml(html);
		div.className = "img-fluid item-comic-image";
		div.appendChild(pub.imageFromHtml(html));

		function addAnchor(html, cls) {
			var container = document.createElement("i");
			var a = document.createElement("a");
			a.href = pub.linkFromHtml(html, cls);
			container.className = linkClassLookup[cls];
			container.appendChild(a);
			div.appendChild(container);
		};

		addAnchor(html, "prev");
		addAnchor(html, "next");

		var outer = document.createElement("div");
		outer.appendChild(div);

		return outer.innerHTML;
	};

	var RIGHT = 39;
	var LEFT = 37;
	var ESC = 27;

	var zoom = true;

	var historySpecified = history.state != null;
	var historyValid = historySpecified && validOrNull(history.state) != null;
	var currentHtml = history.state || document.documentElement.innerHTML;

	pub.load = function(url, onload) {
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function() {
			if(xhr.readyState !== XMLHttpRequest.DONE)
				return;
			var html = xhr.responseText;
			pub.showPanel(html);
			history.pushState(pub.compactHtml(html), pub.titleFromHtml(html), url);
			if(typeof onload === "function")
				onload();
		};
		xhr.open("GET", url, true);
		xhr.send();
	};

	pub.go = function(cls) {
		var link = pub.linkFromHtml(currentHtml, cls);
		if(link !== null) {
			pub.load(link);
		}
	};

	function keyDownHandler(e) {
		if(e.which === LEFT || e.which === RIGHT) {
			var cls = e.which === LEFT ? "prev" : "next";
			pub.go(cls);
		}
		if(e.which === "B".charCodeAt(0)) {
			pub.updateBookmark();
		}
		if(e.which === "J".charCodeAt(0)) {
			pub.loadBookmark();
		}
		if(e.which === "Z".charCodeAt(0)) {
			zoom = !zoom;
			pub.showPanel(history.state);
		}
		if(e.which === ESC)
			pub.shutdown();
	};

	function popStateHandler(e) {
		e.preventDefault();
		pub.showPanel(e.state);
	};

	window.addEventListener("popstate", popStateHandler);

	destructors.push(function() {
		window.removeEventListener("popstate", popStateHandler);
	});

	var lastPanel = null;

	function destroyLastPanel() {
		if(lastPanel !== null && lastPanel.parentNode !== null) {
			lastPanel.parentNode.removeChild(lastPanel);
		}

		document.body.removeEventListener("keydown", keyDownHandler);

		lastPanel = null;
	}

	destructors.push(destroyLastPanel);

	function positionPanel(div) {
		div.style.display = "inline-block";
		div.style.position = "relative";
		div.style.maxHeight = "99vh";
		if(div.parentNode === null) {
			var fader = document.createElement("div");
			destroyLastPanel();
			lastPanel = fader;
			fader.appendChild(div);
			document.body.appendChild(fader);
			document.body.addEventListener("keydown", keyDownHandler);

			fader.className = "comicsBrowser";
			fader.style.backgroundColor = "rgba(0,0,0,0.9)";
			fader.style.position = "fixed";
			fader.style.left = fader.style.top = fader.style.right = fader.style.bottom = "0px";
			fader.style.zIndex = 2000;
			fader.style.lineHeight = "100vh";
			fader.style.textAlign = "center";
		}
		div.style.lineHeight = "100%";
		div.style.verticalAlign = "middle";
	};

	pub.showPanel = function(html) {
		var div = document.createElement("div");
		var PADDING = "8px";
		div.style.display = "none";
		div.style.boxSizing = "border-box";
		div.style.padding = PADDING;
		div.style.backgroundColor = "#fff";
		div.style.borderRadius = "7px";
		div.style.boxShadow = "0px 7px 7px rgba(0,0,0,0.65)";
		if(html)
			currentHtml = html;
		var image = pub.imageFromHtml(currentHtml);
		if(zoom)
			image.style.minWidth = "90vw";
		image.style.cursor = "pointer";
		var span = document.createElement("span");
		span.style.cursor = "pointer";
		span.style.pointerEvents = "none";
		span.style.display = "block";
		span.style.position = "absolute";
		span.style.backgroundSize = "contain";
		span.style.backgroundRepeat = "no-repeat";
		span.style.backgroundImage = "url("+image.src+")";
		span.style.backgroundPosition = "center center";
		span.style.left = span.style.top = span.style.right = span.style.bottom = PADDING;
		div.appendChild(image);
		div.appendChild(span);
		[image, span].forEach(function(e) {
			e.addEventListener("click", function() {
				pub.go("next");
			});
		});
		image.style.opacity = 0;
		if(image.naturalWidth) {
			positionPanel(div);
		} else {
			image.onerror = image.onload = function() {
				positionPanel(div);
			};
		}

		return div;
	};

	function bookmarkKey() {
		var path = location.pathname.replace(/^\/?([^\/]+)\/.*$/g, "$1");
		var name = decodeURIComponent(path);
		return "bookmark_"+name;
	}

	pub.updateBookmark = function(onlyIfNewer) {
		var oldBookmark = localStorage[bookmarkKey()];
		var url = location.toString();
		if(!onlyIfNewer || url > oldBookmark)
			localStorage[bookmarkKey()] = url;
	};

	pub.loadBookmark = function() {
		var url = localStorage[bookmarkKey()];
		if(url)
			pub.load(url);
	};

	function removeChildrenIf(parent, filter) {
		Array.prototype.slice.call(parent.childNodes)
			.filter(filter)
			.forEach(function(e) {
				e.parentNode.removeChild(e);
			});
	}

	pub.removeDistractions = function() {
		var heads = Array.prototype.slice.call(document.getElementsByTagName("head"));
		heads.forEach(function(head) {
			var keep = { "title": true, "meta": true };
			removeChildrenIf(head, function(child) {
				if(child.nodeType !== Node.ELEMENT_NODE)
					return true;
				return !keep[child.tagName.toLowerCase()];
			});
		});

		var body = document.body;
		removeChildrenIf(body, function(child) {
			return child.className !== "comicsBrowser";
		});

		var maxTimeout = setTimeout(function() { }, 0);
		for(var i=0; i<maxTimeout; ++i) {
			clearTimeout(i);
			clearInterval(i);
		}
	};

	pub.shutdown = function() {
		destructors.forEach(function(d) {
			try {
				d();
			} catch(e) {
				console.error(e);
			}
		});
	};

	pub.showPanel();
	if(historySpecified && !historyValid) {
		pub.load(location.toString());
	}

	return pub;
})(window.comicsbrowser);
