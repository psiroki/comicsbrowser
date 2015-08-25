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
	
	pub.imageFromHtml = function(html) {
		var p = html.indexOf("class=\"strip\"");
		var p2 = html.lastIndexOf("<img", html.indexOf("class=\"strip\"", p+1));
		var src = x(html).endOf("src=\"", p2);
		var srcEnd = html.indexOf('"', src);
		var imgHtml = "<img src=\""+html.substring(src, srcEnd)+"\"/>";
		var div = document.createElement("div");
		div.innerHTML = imgHtml;
		var img = div.firstChild;
		div.removeChild(img);
		return img;
	};
	
	pub.linkFromHtml = function(html, linkClass) {
		var p = html.indexOf("class=\""+linkClass+"\"");
		if(p < 0)
			return null;
		var p2 = html.lastIndexOf("<", p);
		if(p2 < 0 || !/^<a\s$/g.test(html.substring(p2, p2+3)))
			return null;
		var src = x(html).endOf("href=\"", p2);
		if(src < 0)
			return null;
		var srcEnd = html.indexOf('"', src);
		if(srcEnd < 0)
			return null;
		var imgHtml = "<a href=\""+html.substring(src, srcEnd)+"\">foo</a>";
		var div = document.createElement("div");
		div.innerHTML = imgHtml;
		var a = div.firstChild;
		return a.href;
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
		var img = document.createElement("img");
		img.className = "strip";
		div.appendChild(img);
		div.appendChild(pub.imageFromHtml(html));
		
		function addAnchor(html, cls) {
			var a = document.createElement("a");
			a.href = pub.linkFromHtml(html, cls);
			a.className = cls;
			div.appendChild(a);
		};
		
		addAnchor(html, "prev");
		addAnchor(html, "next");
		
		return div.innerHTML;
	};
	
	var RIGHT = 39;
	var LEFT = 37;
	var ESC = 27;
	
	var zoom = true;
	
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
		div.style.display = "block";
		div.style.maxHeight = "99vh";
		if(div.parentNode === null) {
			var fader = document.createElement("div");
			destroyLastPanel();
			lastPanel = fader;
			fader.appendChild(div);
			document.body.appendChild(fader);
			document.body.addEventListener("keydown", keyDownHandler);
			
			fader.style.backgroundColor = "rgba(0,0,0,0.9)";
			fader.style.position = "fixed";
			fader.style.left = fader.style.top = fader.style.right = fader.style.bottom = "0px";
			fader.style.zIndex = 1000;
		}
		div.style.position = "absolute";
		var w = div.offsetWidth;
		var h = div.offsetHeight;
		div.style.marginLeft = Math.floor(-w/2)+"px";
		div.style.marginTop = Math.floor(-h/2)+"px";
		div.style.top = "50vh";
		div.style.left = "50vw";
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
		image.style.pointerEvents = "none";
		var span = document.createElement("span");
		span.style.cursor = "pointer";
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
	
	return pub;
})(window.comicsbrowser);
