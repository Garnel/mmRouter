define("mmState", ["mmRouter"], function() {
//重写mmRouter中的route方法     
    avalon.router.route = function(method, path, query) {
        path = path.trim()
        var array = this.routingTable[method]

        for (var i = 0, el; el = array[i++]; ) {//el为一个个状态对象，状态对象的callback总是返回一个Promise
            var args = path.match(el.regexp)
            if (args && el.abstract !== true) {//不能是抽象状态
                el.query = query || {}
                el.path = path
                el.params = {}
                var keys = el.keys
                args.shift()
                if (keys.length) {
                    this._parseArgs(args, el)
                }
                if (el.state) {
                    mmState.transitionTo(mmState.currentState, el, args)
                } else {
                    el.callback.apply(el, args)
                }
                return
            }
        }
        if (this.errorback) {
            this.errorback()
        }
    }

    avalon.router.go = function(toName, params) {
        var from = mmState.currentState, to
        var array = this.routingTable.get
        for (var i = 0, el; el = array[i++]; ) {
            if (el.state == toName) {
                to = el
                break
            }
        }
        if (to) {
            avalon.mix(true, to.params, params)
            var args = to.keys.map(function(el) {
                return to.params [el.name] || ""
            })
            mmState.transitionTo(from, to, args)
        }
    }
 

    //得到所有要处理的视图容器
    function getViews(ctrl, name) {
        var v = avalon.vmodels[ctrl]
        var firstExpr = v && v.$events.expr || "[ms-controller='" + ctrl + "']"
        var otherExpr = []
        name.split(".").forEach(function() {
            otherExpr.push("[ms-view]")
        })

        if (document.querySelectorAll) {
            return document.querySelectorAll(firstExpr + " " + otherExpr.join(" "))
        } else {
            var seeds = Array.prototype.filter.call(document.getElementsByTagName("*"), function(node) {
                return typeof node.getAttribute("ms-view") === "string"
            })
            while (otherExpr.length > 1) {
                otherExpr.pop()
                seeds = matchSelectors(seeds, function(node) {
                    return typeof node.getAttribute("ms-view") === "string"
                })
            }
            seeds = matchSelectors(seeds, function(node) {
                return typeof node.getAttribute("ms-controller") === ctrl
            })
            return seeds.map(function(el) {
                return el.node
            })
        }
    }
    function  matchSelectors(array, match) {
        for (var i = 0, n = array.length; i < n; i++) {
            matchSelector(i, array, match)
        }
        return array.filter(function(el) {
            return el
        })
    }

    function matchSelector(i, array, match) {
        var parent = array[i]
        var node = parent
        if (parent.node) {
            parent = parent.parent
            node = parent.node
        }
        while (parent) {
            if (match(parent)) {
                return array[i] = {
                    node: node,
                    parent: parent
                }
            }
            parent = parent.parentNode
        }
        array[i] = false
    }



    function getNamedView(nodes, name) {
        for (var i = 0, el; el = nodes[i++]; ) {
            if (el.getAttribute("ms-view") === name) {
                return el
            }
        }
    }

    function fromString(template, params) {
        var promise = new Promise(function(resolve, reject) {
            var str = typeof template === "function" ? template(params) : template
            if (typeof str == "string") {
                resolve(str)
            } else {
                reject(new Error("template必须对应一个字符串或一个返回字符串的函数"))
            }
        })
        return promise
    }
    var getXHR = function() {
        return new (window.XMLHttpRequest || ActiveXObject)("Microsoft.XMLHTTP")
    }
    function fromUrl(url, params) {
        var promise = new Promise(function(resolve, reject) {
            if (typeof url === "function") {
                url = url(params)
            }
            if (typeof url !== "string") {
                return reject(new Error("templateUrl必须对应一个URL"))
            }
            if (avalon.templateCache[url]) {
                resolve(avalon.templateCache[url])
            }
            var xhr = getXHR()
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    var status = xhr.status;
                    if (status > 399 && status < 600) {
                        reject(new Error(url + " 对应资源不存在或没有开启 CORS"))
                    } else {
                        resolve(avalon.templateCache[url] = xhr.responseText)
                    }
                }
            }
            xhr.open("GET", url, true)
            if ("withCredentials" in xhr) {
                xhr.withCredentials = true
            }
            xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest")
            xhr.send()
        })
        return promise
    }
    function fromProvider(fn, params) {
        return typeof fn === "function" ? fn(params) : fn
    }
    function fromConfig(config, params) {
        return config.template ? fromString(config.template, params) :
                config.templateUrl ? fromUrl(config.templateUrl, params) :
                config.templateProvider ? fromProvider(config.templateProvider, params) : null
    }

    function getParent(state) {
        var match = state.match(/([\.\w]+)\./) || ["", ""]
        var parentState = match[1]
        if (parentState) {
            var array = avalon.router.routingTable.get
            for (var i = 0, el; el = array[i++]; ) {
                if (el.state === parentState) {
                    return el
                }
            }
            throw new Error("必须先定义[" + parentState + "]")
        }
    }

    var mmState = {
        currentState: null,
        transitionTo: function(fromState, toState, args) {
            mmState.currentState = toState
            var states = []
            var t = toState
            if (!fromState) {
                while (t) {
                    states.push(t)
                    t = t.parent
                }
            } else if (fromState === toState) {
                states.push(t)
            } else {
                while (t && t !== fromState) {
                    states.push(t)
                    t = t.parent
                }
            }
            states.reverse();
            var out = new Promise(function(resolve) {
                resolve()
            })
            states.forEach(function(state) {
                out = out.then(function() {
                    return  state.callback.apply(state, args)
                })
            })
        }
    }
    //用于收集可用于扫描的vmodels
    function getVModels(opts) {
        var array = []
        function getVModel(opts, array) {
            var ctrl = opts.controller
            if (avalon.vmodels[ctrl]) {
                avalon.Array.ensure(array, avalon.vmodels[ctrl])
            }
            if (opts.parent) {
                getVModel(opts.parent, array)
            }
        }
        getVModel(opts, array)
        return array
    }
    /*
     * 对 avalon.router.get 进行重新封装
     * state： 指定当前状态名
     * controller： 指定当前所在的VM的名字
     * parent: 父状态对象
     * views: 对多个[ms-view]容器进行处理,
     *     每个对象都包含template, templateUrl, templateProvider, resolve
     *     template*属性必须存在其中一个,它们要求返回一个字符串或一个Promise对象
     *     resolve是可选
     *     如果不写views属性,则默认view为"",这四个属性可以直接写在opts对象上
     * template: 指定当前模板，也可以为一个函数，传入opts.params作参数
     * templateUrl: 指定当前模板的路径，也可以为一个函数，传入opts.params作参数
     * templateProvider: 指定当前模板的提供者，它可以是一个Promise，也可以为一个函数，传入opts.params作参数
     * resolve: 我们可以在此方法 定义此模板用到的VM， 或修改VM的属性
     * abstract: 表示它不参与匹配
     */
    function copyTemplateProperty(newObj, oldObj, name) {
        newObj[name] = oldObj[name]
        delete  oldObj[name]
    }


    avalon.state = function(stateName, opts) {
        var parent = getParent(stateName)
        if (parent) {
            opts.url = parent.url + opts.url
            opts.parent = parent
        }
        var vmodes = getVModels(opts)
        var topCtrlName = vmodes[vmodes.length - 1].$id
        opts.state = stateName
        if (!opts.views) {
            var view = {}
            "template,templateUrl,templateProvider,resolve".replace(/\w+/g, function(prop) {
                copyTemplateProperty(view, opts, prop)
            })
            opts.views = {
                "": view
            }
        }

        avalon.router.get(opts.url, function() {
            var that = this, args = arguments
            var promises = []
            avalon.each(opts.views, function(name, view) {
                if (name.indexOf("@") > 0) {
                    var match = name.split("@")
                    var viewname = match[0]
                    var statename = match[1]
                } else {
                    viewname = name || ""
                    statename = stateName
                }
                var nodes = getViews(topCtrlName, statename)
                //   console.log(topCtrlName, statename, viewname)
                var node = getNamedView(nodes, viewname)
                if (node) {
                    var promise = fromConfig(view, that.params)
                    var cb = typeof view.resolve === "function" ? view.resolve : avalon.noop
                    if (promise && promise.then) {
                        promise.then(function(s) {
                            avalon.innerHTML(node, s)
                            cb.apply(that, args)
                            avalon.scan(node, getVModels(opts))
                        })
                        promises.push(promise)
                    }
                }
            })
            return Promise.all(promises)

        }, opts)
        return this
    }
})
