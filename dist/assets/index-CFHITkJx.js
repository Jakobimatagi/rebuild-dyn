(function () {
  const S = document.createElement("link").relList;
  if (S && S.supports && S.supports("modulepreload")) return;
  for (const C of document.querySelectorAll('link[rel="modulepreload"]')) R(C);
  new MutationObserver((C) => {
    for (const P of C)
      if (P.type === "childList")
        for (const z of P.addedNodes)
          z.tagName === "LINK" && z.rel === "modulepreload" && R(z);
  }).observe(document, { childList: !0, subtree: !0 });
  function d(C) {
    const P = {};
    return (
      C.integrity && (P.integrity = C.integrity),
      C.referrerPolicy && (P.referrerPolicy = C.referrerPolicy),
      C.crossOrigin === "use-credentials"
        ? (P.credentials = "include")
        : C.crossOrigin === "anonymous"
          ? (P.credentials = "omit")
          : (P.credentials = "same-origin"),
      P
    );
  }
  function R(C) {
    if (C.ep) return;
    C.ep = !0;
    const P = d(C);
    fetch(C.href, P);
  }
})();
var Oi = { exports: {} },
  Tr = {},
  Ii = { exports: {} },
  J = {};
/**
 * @license React
 * react.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */ var Ra;
function Bf() {
  if (Ra) return J;
  Ra = 1;
  var y = Symbol.for("react.element"),
    S = Symbol.for("react.portal"),
    d = Symbol.for("react.fragment"),
    R = Symbol.for("react.strict_mode"),
    C = Symbol.for("react.profiler"),
    P = Symbol.for("react.provider"),
    z = Symbol.for("react.context"),
    _ = Symbol.for("react.forward_ref"),
    M = Symbol.for("react.suspense"),
    A = Symbol.for("react.memo"),
    W = Symbol.for("react.lazy"),
    Q = Symbol.iterator;
  function B(s) {
    return s === null || typeof s != "object"
      ? null
      : ((s = (Q && s[Q]) || s["@@iterator"]),
        typeof s == "function" ? s : null);
  }
  var te = {
      isMounted: function () {
        return !1;
      },
      enqueueForceUpdate: function () {},
      enqueueReplaceState: function () {},
      enqueueSetState: function () {},
    },
    we = Object.assign,
    b = {};
  function q(s, v, I) {
    ((this.props = s),
      (this.context = v),
      (this.refs = b),
      (this.updater = I || te));
  }
  ((q.prototype.isReactComponent = {}),
    (q.prototype.setState = function (s, v) {
      if (typeof s != "object" && typeof s != "function" && s != null)
        throw Error(
          "setState(...): takes an object of state variables to update or a function which returns an object of state variables.",
        );
      this.updater.enqueueSetState(this, s, v, "setState");
    }),
    (q.prototype.forceUpdate = function (s) {
      this.updater.enqueueForceUpdate(this, s, "forceUpdate");
    }));
  function Oe() {}
  Oe.prototype = q.prototype;
  function ze(s, v, I) {
    ((this.props = s),
      (this.context = v),
      (this.refs = b),
      (this.updater = I || te));
  }
  var ve = (ze.prototype = new Oe());
  ((ve.constructor = ze), we(ve, q.prototype), (ve.isPureReactComponent = !0));
  var se = Array.isArray,
    _e = Object.prototype.hasOwnProperty,
    Z = { current: null },
    ce = { key: !0, ref: !0, __self: !0, __source: !0 };
  function Se(s, v, I) {
    var V,
      X = {},
      K = null,
      le = null;
    if (v != null)
      for (V in (v.ref !== void 0 && (le = v.ref),
      v.key !== void 0 && (K = "" + v.key),
      v))
        _e.call(v, V) && !ce.hasOwnProperty(V) && (X[V] = v[V]);
    var ne = arguments.length - 2;
    if (ne === 1) X.children = I;
    else if (1 < ne) {
      for (var ae = Array(ne), We = 0; We < ne; We++)
        ae[We] = arguments[We + 2];
      X.children = ae;
    }
    if (s && s.defaultProps)
      for (V in ((ne = s.defaultProps), ne)) X[V] === void 0 && (X[V] = ne[V]);
    return {
      $$typeof: y,
      type: s,
      key: K,
      ref: le,
      props: X,
      _owner: Z.current,
    };
  }
  function Te(s, v) {
    return {
      $$typeof: y,
      type: s.type,
      key: v,
      ref: s.ref,
      props: s.props,
      _owner: s._owner,
    };
  }
  function Fe(s) {
    return typeof s == "object" && s !== null && s.$$typeof === y;
  }
  function ct(s) {
    var v = { "=": "=0", ":": "=2" };
    return (
      "$" +
      s.replace(/[=:]/g, function (I) {
        return v[I];
      })
    );
  }
  var Qe = /\/+/g;
  function Ie(s, v) {
    return typeof s == "object" && s !== null && s.key != null
      ? ct("" + s.key)
      : v.toString(36);
  }
  function G(s, v, I, V, X) {
    var K = typeof s;
    (K === "undefined" || K === "boolean") && (s = null);
    var le = !1;
    if (s === null) le = !0;
    else
      switch (K) {
        case "string":
        case "number":
          le = !0;
          break;
        case "object":
          switch (s.$$typeof) {
            case y:
            case S:
              le = !0;
          }
      }
    if (le)
      return (
        (le = s),
        (X = X(le)),
        (s = V === "" ? "." + Ie(le, 0) : V),
        se(X)
          ? ((I = ""),
            s != null && (I = s.replace(Qe, "$&/") + "/"),
            G(X, v, I, "", function (We) {
              return We;
            }))
          : X != null &&
            (Fe(X) &&
              (X = Te(
                X,
                I +
                  (!X.key || (le && le.key === X.key)
                    ? ""
                    : ("" + X.key).replace(Qe, "$&/") + "/") +
                  s,
              )),
            v.push(X)),
        1
      );
    if (((le = 0), (V = V === "" ? "." : V + ":"), se(s)))
      for (var ne = 0; ne < s.length; ne++) {
        K = s[ne];
        var ae = V + Ie(K, ne);
        le += G(K, v, I, ae, X);
      }
    else if (((ae = B(s)), typeof ae == "function"))
      for (s = ae.call(s), ne = 0; !(K = s.next()).done; )
        ((K = K.value), (ae = V + Ie(K, ne++)), (le += G(K, v, I, ae, X)));
    else if (K === "object")
      throw (
        (v = String(s)),
        Error(
          "Objects are not valid as a React child (found: " +
            (v === "[object Object]"
              ? "object with keys {" + Object.keys(s).join(", ") + "}"
              : v) +
            "). If you meant to render a collection of children, use an array instead.",
        )
      );
    return le;
  }
  function ee(s, v, I) {
    if (s == null) return s;
    var V = [],
      X = 0;
    return (
      G(s, V, "", "", function (K) {
        return v.call(I, K, X++);
      }),
      V
    );
  }
  function de(s) {
    if (s._status === -1) {
      var v = s._result;
      ((v = v()),
        v.then(
          function (I) {
            (s._status === 0 || s._status === -1) &&
              ((s._status = 1), (s._result = I));
          },
          function (I) {
            (s._status === 0 || s._status === -1) &&
              ((s._status = 2), (s._result = I));
          },
        ),
        s._status === -1 && ((s._status = 0), (s._result = v)));
    }
    if (s._status === 1) return s._result.default;
    throw s._result;
  }
  var ie = { current: null },
    j = { transition: null },
    F = {
      ReactCurrentDispatcher: ie,
      ReactCurrentBatchConfig: j,
      ReactCurrentOwner: Z,
    };
  function m() {
    throw Error("act(...) is not supported in production builds of React.");
  }
  return (
    (J.Children = {
      map: ee,
      forEach: function (s, v, I) {
        ee(
          s,
          function () {
            v.apply(this, arguments);
          },
          I,
        );
      },
      count: function (s) {
        var v = 0;
        return (
          ee(s, function () {
            v++;
          }),
          v
        );
      },
      toArray: function (s) {
        return (
          ee(s, function (v) {
            return v;
          }) || []
        );
      },
      only: function (s) {
        if (!Fe(s))
          throw Error(
            "React.Children.only expected to receive a single React element child.",
          );
        return s;
      },
    }),
    (J.Component = q),
    (J.Fragment = d),
    (J.Profiler = C),
    (J.PureComponent = ze),
    (J.StrictMode = R),
    (J.Suspense = M),
    (J.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = F),
    (J.act = m),
    (J.cloneElement = function (s, v, I) {
      if (s == null)
        throw Error(
          "React.cloneElement(...): The argument must be a React element, but you passed " +
            s +
            ".",
        );
      var V = we({}, s.props),
        X = s.key,
        K = s.ref,
        le = s._owner;
      if (v != null) {
        if (
          (v.ref !== void 0 && ((K = v.ref), (le = Z.current)),
          v.key !== void 0 && (X = "" + v.key),
          s.type && s.type.defaultProps)
        )
          var ne = s.type.defaultProps;
        for (ae in v)
          _e.call(v, ae) &&
            !ce.hasOwnProperty(ae) &&
            (V[ae] = v[ae] === void 0 && ne !== void 0 ? ne[ae] : v[ae]);
      }
      var ae = arguments.length - 2;
      if (ae === 1) V.children = I;
      else if (1 < ae) {
        ne = Array(ae);
        for (var We = 0; We < ae; We++) ne[We] = arguments[We + 2];
        V.children = ne;
      }
      return {
        $$typeof: y,
        type: s.type,
        key: X,
        ref: K,
        props: V,
        _owner: le,
      };
    }),
    (J.createContext = function (s) {
      return (
        (s = {
          $$typeof: z,
          _currentValue: s,
          _currentValue2: s,
          _threadCount: 0,
          Provider: null,
          Consumer: null,
          _defaultValue: null,
          _globalName: null,
        }),
        (s.Provider = { $$typeof: P, _context: s }),
        (s.Consumer = s)
      );
    }),
    (J.createElement = Se),
    (J.createFactory = function (s) {
      var v = Se.bind(null, s);
      return ((v.type = s), v);
    }),
    (J.createRef = function () {
      return { current: null };
    }),
    (J.forwardRef = function (s) {
      return { $$typeof: _, render: s };
    }),
    (J.isValidElement = Fe),
    (J.lazy = function (s) {
      return { $$typeof: W, _payload: { _status: -1, _result: s }, _init: de };
    }),
    (J.memo = function (s, v) {
      return { $$typeof: A, type: s, compare: v === void 0 ? null : v };
    }),
    (J.startTransition = function (s) {
      var v = j.transition;
      j.transition = {};
      try {
        s();
      } finally {
        j.transition = v;
      }
    }),
    (J.unstable_act = m),
    (J.useCallback = function (s, v) {
      return ie.current.useCallback(s, v);
    }),
    (J.useContext = function (s) {
      return ie.current.useContext(s);
    }),
    (J.useDebugValue = function () {}),
    (J.useDeferredValue = function (s) {
      return ie.current.useDeferredValue(s);
    }),
    (J.useEffect = function (s, v) {
      return ie.current.useEffect(s, v);
    }),
    (J.useId = function () {
      return ie.current.useId();
    }),
    (J.useImperativeHandle = function (s, v, I) {
      return ie.current.useImperativeHandle(s, v, I);
    }),
    (J.useInsertionEffect = function (s, v) {
      return ie.current.useInsertionEffect(s, v);
    }),
    (J.useLayoutEffect = function (s, v) {
      return ie.current.useLayoutEffect(s, v);
    }),
    (J.useMemo = function (s, v) {
      return ie.current.useMemo(s, v);
    }),
    (J.useReducer = function (s, v, I) {
      return ie.current.useReducer(s, v, I);
    }),
    (J.useRef = function (s) {
      return ie.current.useRef(s);
    }),
    (J.useState = function (s) {
      return ie.current.useState(s);
    }),
    (J.useSyncExternalStore = function (s, v, I) {
      return ie.current.useSyncExternalStore(s, v, I);
    }),
    (J.useTransition = function () {
      return ie.current.useTransition();
    }),
    (J.version = "18.3.1"),
    J
  );
}
var Na;
function Bi() {
  return (Na || ((Na = 1), (Ii.exports = Bf())), Ii.exports);
}
/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */ var La;
function Uf() {
  if (La) return Tr;
  La = 1;
  var y = Bi(),
    S = Symbol.for("react.element"),
    d = Symbol.for("react.fragment"),
    R = Object.prototype.hasOwnProperty,
    C = y.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,
    P = { key: !0, ref: !0, __self: !0, __source: !0 };
  function z(_, M, A) {
    var W,
      Q = {},
      B = null,
      te = null;
    (A !== void 0 && (B = "" + A),
      M.key !== void 0 && (B = "" + M.key),
      M.ref !== void 0 && (te = M.ref));
    for (W in M) R.call(M, W) && !P.hasOwnProperty(W) && (Q[W] = M[W]);
    if (_ && _.defaultProps)
      for (W in ((M = _.defaultProps), M)) Q[W] === void 0 && (Q[W] = M[W]);
    return {
      $$typeof: S,
      type: _,
      key: B,
      ref: te,
      props: Q,
      _owner: C.current,
    };
  }
  return ((Tr.Fragment = d), (Tr.jsx = z), (Tr.jsxs = z), Tr);
}
var Oa;
function $f() {
  return (Oa || ((Oa = 1), (Oi.exports = Uf())), Oi.exports);
}
var c = $f(),
  qe = Bi(),
  $l = {},
  Mi = { exports: {} },
  Ze = {},
  Di = { exports: {} },
  Fi = {};
/**
 * @license React
 * scheduler.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */ var Ia;
function Wf() {
  return (
    Ia ||
      ((Ia = 1),
      (function (y) {
        function S(j, F) {
          var m = j.length;
          j.push(F);
          e: for (; 0 < m; ) {
            var s = (m - 1) >>> 1,
              v = j[s];
            if (0 < C(v, F)) ((j[s] = F), (j[m] = v), (m = s));
            else break e;
          }
        }
        function d(j) {
          return j.length === 0 ? null : j[0];
        }
        function R(j) {
          if (j.length === 0) return null;
          var F = j[0],
            m = j.pop();
          if (m !== F) {
            j[0] = m;
            e: for (var s = 0, v = j.length, I = v >>> 1; s < I; ) {
              var V = 2 * (s + 1) - 1,
                X = j[V],
                K = V + 1,
                le = j[K];
              if (0 > C(X, m))
                K < v && 0 > C(le, X)
                  ? ((j[s] = le), (j[K] = m), (s = K))
                  : ((j[s] = X), (j[V] = m), (s = V));
              else if (K < v && 0 > C(le, m))
                ((j[s] = le), (j[K] = m), (s = K));
              else break e;
            }
          }
          return F;
        }
        function C(j, F) {
          var m = j.sortIndex - F.sortIndex;
          return m !== 0 ? m : j.id - F.id;
        }
        if (
          typeof performance == "object" &&
          typeof performance.now == "function"
        ) {
          var P = performance;
          y.unstable_now = function () {
            return P.now();
          };
        } else {
          var z = Date,
            _ = z.now();
          y.unstable_now = function () {
            return z.now() - _;
          };
        }
        var M = [],
          A = [],
          W = 1,
          Q = null,
          B = 3,
          te = !1,
          we = !1,
          b = !1,
          q = typeof setTimeout == "function" ? setTimeout : null,
          Oe = typeof clearTimeout == "function" ? clearTimeout : null,
          ze = typeof setImmediate < "u" ? setImmediate : null;
        typeof navigator < "u" &&
          navigator.scheduling !== void 0 &&
          navigator.scheduling.isInputPending !== void 0 &&
          navigator.scheduling.isInputPending.bind(navigator.scheduling);
        function ve(j) {
          for (var F = d(A); F !== null; ) {
            if (F.callback === null) R(A);
            else if (F.startTime <= j)
              (R(A), (F.sortIndex = F.expirationTime), S(M, F));
            else break;
            F = d(A);
          }
        }
        function se(j) {
          if (((b = !1), ve(j), !we))
            if (d(M) !== null) ((we = !0), de(_e));
            else {
              var F = d(A);
              F !== null && ie(se, F.startTime - j);
            }
        }
        function _e(j, F) {
          ((we = !1), b && ((b = !1), Oe(Se), (Se = -1)), (te = !0));
          var m = B;
          try {
            for (
              ve(F), Q = d(M);
              Q !== null && (!(Q.expirationTime > F) || (j && !ct()));
            ) {
              var s = Q.callback;
              if (typeof s == "function") {
                ((Q.callback = null), (B = Q.priorityLevel));
                var v = s(Q.expirationTime <= F);
                ((F = y.unstable_now()),
                  typeof v == "function"
                    ? (Q.callback = v)
                    : Q === d(M) && R(M),
                  ve(F));
              } else R(M);
              Q = d(M);
            }
            if (Q !== null) var I = !0;
            else {
              var V = d(A);
              (V !== null && ie(se, V.startTime - F), (I = !1));
            }
            return I;
          } finally {
            ((Q = null), (B = m), (te = !1));
          }
        }
        var Z = !1,
          ce = null,
          Se = -1,
          Te = 5,
          Fe = -1;
        function ct() {
          return !(y.unstable_now() - Fe < Te);
        }
        function Qe() {
          if (ce !== null) {
            var j = y.unstable_now();
            Fe = j;
            var F = !0;
            try {
              F = ce(!0, j);
            } finally {
              F ? Ie() : ((Z = !1), (ce = null));
            }
          } else Z = !1;
        }
        var Ie;
        if (typeof ze == "function")
          Ie = function () {
            ze(Qe);
          };
        else if (typeof MessageChannel < "u") {
          var G = new MessageChannel(),
            ee = G.port2;
          ((G.port1.onmessage = Qe),
            (Ie = function () {
              ee.postMessage(null);
            }));
        } else
          Ie = function () {
            q(Qe, 0);
          };
        function de(j) {
          ((ce = j), Z || ((Z = !0), Ie()));
        }
        function ie(j, F) {
          Se = q(function () {
            j(y.unstable_now());
          }, F);
        }
        ((y.unstable_IdlePriority = 5),
          (y.unstable_ImmediatePriority = 1),
          (y.unstable_LowPriority = 4),
          (y.unstable_NormalPriority = 3),
          (y.unstable_Profiling = null),
          (y.unstable_UserBlockingPriority = 2),
          (y.unstable_cancelCallback = function (j) {
            j.callback = null;
          }),
          (y.unstable_continueExecution = function () {
            we || te || ((we = !0), de(_e));
          }),
          (y.unstable_forceFrameRate = function (j) {
            0 > j || 125 < j
              ? console.error(
                  "forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported",
                )
              : (Te = 0 < j ? Math.floor(1e3 / j) : 5);
          }),
          (y.unstable_getCurrentPriorityLevel = function () {
            return B;
          }),
          (y.unstable_getFirstCallbackNode = function () {
            return d(M);
          }),
          (y.unstable_next = function (j) {
            switch (B) {
              case 1:
              case 2:
              case 3:
                var F = 3;
                break;
              default:
                F = B;
            }
            var m = B;
            B = F;
            try {
              return j();
            } finally {
              B = m;
            }
          }),
          (y.unstable_pauseExecution = function () {}),
          (y.unstable_requestPaint = function () {}),
          (y.unstable_runWithPriority = function (j, F) {
            switch (j) {
              case 1:
              case 2:
              case 3:
              case 4:
              case 5:
                break;
              default:
                j = 3;
            }
            var m = B;
            B = j;
            try {
              return F();
            } finally {
              B = m;
            }
          }),
          (y.unstable_scheduleCallback = function (j, F, m) {
            var s = y.unstable_now();
            switch (
              (typeof m == "object" && m !== null
                ? ((m = m.delay),
                  (m = typeof m == "number" && 0 < m ? s + m : s))
                : (m = s),
              j)
            ) {
              case 1:
                var v = -1;
                break;
              case 2:
                v = 250;
                break;
              case 5:
                v = 1073741823;
                break;
              case 4:
                v = 1e4;
                break;
              default:
                v = 5e3;
            }
            return (
              (v = m + v),
              (j = {
                id: W++,
                callback: F,
                priorityLevel: j,
                startTime: m,
                expirationTime: v,
                sortIndex: -1,
              }),
              m > s
                ? ((j.sortIndex = m),
                  S(A, j),
                  d(M) === null &&
                    j === d(A) &&
                    (b ? (Oe(Se), (Se = -1)) : (b = !0), ie(se, m - s)))
                : ((j.sortIndex = v), S(M, j), we || te || ((we = !0), de(_e))),
              j
            );
          }),
          (y.unstable_shouldYield = ct),
          (y.unstable_wrapCallback = function (j) {
            var F = B;
            return function () {
              var m = B;
              B = F;
              try {
                return j.apply(this, arguments);
              } finally {
                B = m;
              }
            };
          }));
      })(Fi)),
    Fi
  );
}
var Ma;
function Vf() {
  return (Ma || ((Ma = 1), (Di.exports = Wf())), Di.exports);
}
/**
 * @license React
 * react-dom.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */ var Da;
function Hf() {
  if (Da) return Ze;
  Da = 1;
  var y = Bi(),
    S = Vf();
  function d(e) {
    for (
      var t = "https://reactjs.org/docs/error-decoder.html?invariant=" + e,
        n = 1;
      n < arguments.length;
      n++
    )
      t += "&args[]=" + encodeURIComponent(arguments[n]);
    return (
      "Minified React error #" +
      e +
      "; visit " +
      t +
      " for the full message or use the non-minified dev environment for full errors and additional helpful warnings."
    );
  }
  var R = new Set(),
    C = {};
  function P(e, t) {
    (z(e, t), z(e + "Capture", t));
  }
  function z(e, t) {
    for (C[e] = t, e = 0; e < t.length; e++) R.add(t[e]);
  }
  var _ = !(
      typeof window > "u" ||
      typeof window.document > "u" ||
      typeof window.document.createElement > "u"
    ),
    M = Object.prototype.hasOwnProperty,
    A =
      /^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/,
    W = {},
    Q = {};
  function B(e) {
    return M.call(Q, e)
      ? !0
      : M.call(W, e)
        ? !1
        : A.test(e)
          ? (Q[e] = !0)
          : ((W[e] = !0), !1);
  }
  function te(e, t, n, r) {
    if (n !== null && n.type === 0) return !1;
    switch (typeof t) {
      case "function":
      case "symbol":
        return !0;
      case "boolean":
        return r
          ? !1
          : n !== null
            ? !n.acceptsBooleans
            : ((e = e.toLowerCase().slice(0, 5)),
              e !== "data-" && e !== "aria-");
      default:
        return !1;
    }
  }
  function we(e, t, n, r) {
    if (t === null || typeof t > "u" || te(e, t, n, r)) return !0;
    if (r) return !1;
    if (n !== null)
      switch (n.type) {
        case 3:
          return !t;
        case 4:
          return t === !1;
        case 5:
          return isNaN(t);
        case 6:
          return isNaN(t) || 1 > t;
      }
    return !1;
  }
  function b(e, t, n, r, l, o, i) {
    ((this.acceptsBooleans = t === 2 || t === 3 || t === 4),
      (this.attributeName = r),
      (this.attributeNamespace = l),
      (this.mustUseProperty = n),
      (this.propertyName = e),
      (this.type = t),
      (this.sanitizeURL = o),
      (this.removeEmptyString = i));
  }
  var q = {};
  ("children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style"
    .split(" ")
    .forEach(function (e) {
      q[e] = new b(e, 0, !1, e, null, !1, !1);
    }),
    [
      ["acceptCharset", "accept-charset"],
      ["className", "class"],
      ["htmlFor", "for"],
      ["httpEquiv", "http-equiv"],
    ].forEach(function (e) {
      var t = e[0];
      q[t] = new b(t, 1, !1, e[1], null, !1, !1);
    }),
    ["contentEditable", "draggable", "spellCheck", "value"].forEach(
      function (e) {
        q[e] = new b(e, 2, !1, e.toLowerCase(), null, !1, !1);
      },
    ),
    [
      "autoReverse",
      "externalResourcesRequired",
      "focusable",
      "preserveAlpha",
    ].forEach(function (e) {
      q[e] = new b(e, 2, !1, e, null, !1, !1);
    }),
    "allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope"
      .split(" ")
      .forEach(function (e) {
        q[e] = new b(e, 3, !1, e.toLowerCase(), null, !1, !1);
      }),
    ["checked", "multiple", "muted", "selected"].forEach(function (e) {
      q[e] = new b(e, 3, !0, e, null, !1, !1);
    }),
    ["capture", "download"].forEach(function (e) {
      q[e] = new b(e, 4, !1, e, null, !1, !1);
    }),
    ["cols", "rows", "size", "span"].forEach(function (e) {
      q[e] = new b(e, 6, !1, e, null, !1, !1);
    }),
    ["rowSpan", "start"].forEach(function (e) {
      q[e] = new b(e, 5, !1, e.toLowerCase(), null, !1, !1);
    }));
  var Oe = /[\-:]([a-z])/g;
  function ze(e) {
    return e[1].toUpperCase();
  }
  ("accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height"
    .split(" ")
    .forEach(function (e) {
      var t = e.replace(Oe, ze);
      q[t] = new b(t, 1, !1, e, null, !1, !1);
    }),
    "xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type"
      .split(" ")
      .forEach(function (e) {
        var t = e.replace(Oe, ze);
        q[t] = new b(t, 1, !1, e, "http://www.w3.org/1999/xlink", !1, !1);
      }),
    ["xml:base", "xml:lang", "xml:space"].forEach(function (e) {
      var t = e.replace(Oe, ze);
      q[t] = new b(t, 1, !1, e, "http://www.w3.org/XML/1998/namespace", !1, !1);
    }),
    ["tabIndex", "crossOrigin"].forEach(function (e) {
      q[e] = new b(e, 1, !1, e.toLowerCase(), null, !1, !1);
    }),
    (q.xlinkHref = new b(
      "xlinkHref",
      1,
      !1,
      "xlink:href",
      "http://www.w3.org/1999/xlink",
      !0,
      !1,
    )),
    ["src", "href", "action", "formAction"].forEach(function (e) {
      q[e] = new b(e, 1, !1, e.toLowerCase(), null, !0, !0);
    }));
  function ve(e, t, n, r) {
    var l = q.hasOwnProperty(t) ? q[t] : null;
    (l !== null
      ? l.type !== 0
      : r ||
        !(2 < t.length) ||
        (t[0] !== "o" && t[0] !== "O") ||
        (t[1] !== "n" && t[1] !== "N")) &&
      (we(t, n, l, r) && (n = null),
      r || l === null
        ? B(t) &&
          (n === null ? e.removeAttribute(t) : e.setAttribute(t, "" + n))
        : l.mustUseProperty
          ? (e[l.propertyName] = n === null ? (l.type === 3 ? !1 : "") : n)
          : ((t = l.attributeName),
            (r = l.attributeNamespace),
            n === null
              ? e.removeAttribute(t)
              : ((l = l.type),
                (n = l === 3 || (l === 4 && n === !0) ? "" : "" + n),
                r ? e.setAttributeNS(r, t, n) : e.setAttribute(t, n))));
  }
  var se = y.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
    _e = Symbol.for("react.element"),
    Z = Symbol.for("react.portal"),
    ce = Symbol.for("react.fragment"),
    Se = Symbol.for("react.strict_mode"),
    Te = Symbol.for("react.profiler"),
    Fe = Symbol.for("react.provider"),
    ct = Symbol.for("react.context"),
    Qe = Symbol.for("react.forward_ref"),
    Ie = Symbol.for("react.suspense"),
    G = Symbol.for("react.suspense_list"),
    ee = Symbol.for("react.memo"),
    de = Symbol.for("react.lazy"),
    ie = Symbol.for("react.offscreen"),
    j = Symbol.iterator;
  function F(e) {
    return e === null || typeof e != "object"
      ? null
      : ((e = (j && e[j]) || e["@@iterator"]),
        typeof e == "function" ? e : null);
  }
  var m = Object.assign,
    s;
  function v(e) {
    if (s === void 0)
      try {
        throw Error();
      } catch (n) {
        var t = n.stack.trim().match(/\n( *(at )?)/);
        s = (t && t[1]) || "";
      }
    return (
      `
` +
      s +
      e
    );
  }
  var I = !1;
  function V(e, t) {
    if (!e || I) return "";
    I = !0;
    var n = Error.prepareStackTrace;
    Error.prepareStackTrace = void 0;
    try {
      if (t)
        if (
          ((t = function () {
            throw Error();
          }),
          Object.defineProperty(t.prototype, "props", {
            set: function () {
              throw Error();
            },
          }),
          typeof Reflect == "object" && Reflect.construct)
        ) {
          try {
            Reflect.construct(t, []);
          } catch (g) {
            var r = g;
          }
          Reflect.construct(e, [], t);
        } else {
          try {
            t.call();
          } catch (g) {
            r = g;
          }
          e.call(t.prototype);
        }
      else {
        try {
          throw Error();
        } catch (g) {
          r = g;
        }
        e();
      }
    } catch (g) {
      if (g && r && typeof g.stack == "string") {
        for (
          var l = g.stack.split(`
`),
            o = r.stack.split(`
`),
            i = l.length - 1,
            u = o.length - 1;
          1 <= i && 0 <= u && l[i] !== o[u];
        )
          u--;
        for (; 1 <= i && 0 <= u; i--, u--)
          if (l[i] !== o[u]) {
            if (i !== 1 || u !== 1)
              do
                if ((i--, u--, 0 > u || l[i] !== o[u])) {
                  var a =
                    `
` + l[i].replace(" at new ", " at ");
                  return (
                    e.displayName &&
                      a.includes("<anonymous>") &&
                      (a = a.replace("<anonymous>", e.displayName)),
                    a
                  );
                }
              while (1 <= i && 0 <= u);
            break;
          }
      }
    } finally {
      ((I = !1), (Error.prepareStackTrace = n));
    }
    return (e = e ? e.displayName || e.name : "") ? v(e) : "";
  }
  function X(e) {
    switch (e.tag) {
      case 5:
        return v(e.type);
      case 16:
        return v("Lazy");
      case 13:
        return v("Suspense");
      case 19:
        return v("SuspenseList");
      case 0:
      case 2:
      case 15:
        return ((e = V(e.type, !1)), e);
      case 11:
        return ((e = V(e.type.render, !1)), e);
      case 1:
        return ((e = V(e.type, !0)), e);
      default:
        return "";
    }
  }
  function K(e) {
    if (e == null) return null;
    if (typeof e == "function") return e.displayName || e.name || null;
    if (typeof e == "string") return e;
    switch (e) {
      case ce:
        return "Fragment";
      case Z:
        return "Portal";
      case Te:
        return "Profiler";
      case Se:
        return "StrictMode";
      case Ie:
        return "Suspense";
      case G:
        return "SuspenseList";
    }
    if (typeof e == "object")
      switch (e.$$typeof) {
        case ct:
          return (e.displayName || "Context") + ".Consumer";
        case Fe:
          return (e._context.displayName || "Context") + ".Provider";
        case Qe:
          var t = e.render;
          return (
            (e = e.displayName),
            e ||
              ((e = t.displayName || t.name || ""),
              (e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef")),
            e
          );
        case ee:
          return (
            (t = e.displayName || null),
            t !== null ? t : K(e.type) || "Memo"
          );
        case de:
          ((t = e._payload), (e = e._init));
          try {
            return K(e(t));
          } catch {}
      }
    return null;
  }
  function le(e) {
    var t = e.type;
    switch (e.tag) {
      case 24:
        return "Cache";
      case 9:
        return (t.displayName || "Context") + ".Consumer";
      case 10:
        return (t._context.displayName || "Context") + ".Provider";
      case 18:
        return "DehydratedFragment";
      case 11:
        return (
          (e = t.render),
          (e = e.displayName || e.name || ""),
          t.displayName || (e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef")
        );
      case 7:
        return "Fragment";
      case 5:
        return t;
      case 4:
        return "Portal";
      case 3:
        return "Root";
      case 6:
        return "Text";
      case 16:
        return K(t);
      case 8:
        return t === Se ? "StrictMode" : "Mode";
      case 22:
        return "Offscreen";
      case 12:
        return "Profiler";
      case 21:
        return "Scope";
      case 13:
        return "Suspense";
      case 19:
        return "SuspenseList";
      case 25:
        return "TracingMarker";
      case 1:
      case 0:
      case 17:
      case 2:
      case 14:
      case 15:
        if (typeof t == "function") return t.displayName || t.name || null;
        if (typeof t == "string") return t;
    }
    return null;
  }
  function ne(e) {
    switch (typeof e) {
      case "boolean":
      case "number":
      case "string":
      case "undefined":
        return e;
      case "object":
        return e;
      default:
        return "";
    }
  }
  function ae(e) {
    var t = e.type;
    return (
      (e = e.nodeName) &&
      e.toLowerCase() === "input" &&
      (t === "checkbox" || t === "radio")
    );
  }
  function We(e) {
    var t = ae(e) ? "checked" : "value",
      n = Object.getOwnPropertyDescriptor(e.constructor.prototype, t),
      r = "" + e[t];
    if (
      !e.hasOwnProperty(t) &&
      typeof n < "u" &&
      typeof n.get == "function" &&
      typeof n.set == "function"
    ) {
      var l = n.get,
        o = n.set;
      return (
        Object.defineProperty(e, t, {
          configurable: !0,
          get: function () {
            return l.call(this);
          },
          set: function (i) {
            ((r = "" + i), o.call(this, i));
          },
        }),
        Object.defineProperty(e, t, { enumerable: n.enumerable }),
        {
          getValue: function () {
            return r;
          },
          setValue: function (i) {
            r = "" + i;
          },
          stopTracking: function () {
            ((e._valueTracker = null), delete e[t]);
          },
        }
      );
    }
  }
  function mn(e) {
    e._valueTracker || (e._valueTracker = We(e));
  }
  function _t(e) {
    if (!e) return !1;
    var t = e._valueTracker;
    if (!t) return !0;
    var n = t.getValue(),
      r = "";
    return (
      e && (r = ae(e) ? (e.checked ? "true" : "false") : e.value),
      (e = r),
      e !== n ? (t.setValue(e), !0) : !1
    );
  }
  function en(e) {
    if (
      ((e = e || (typeof document < "u" ? document : void 0)), typeof e > "u")
    )
      return null;
    try {
      return e.activeElement || e.body;
    } catch {
      return e.body;
    }
  }
  function Vn(e, t) {
    var n = t.checked;
    return m({}, t, {
      defaultChecked: void 0,
      defaultValue: void 0,
      value: void 0,
      checked: n ?? e._wrapperState.initialChecked,
    });
  }
  function Nr(e, t) {
    var n = t.defaultValue == null ? "" : t.defaultValue,
      r = t.checked != null ? t.checked : t.defaultChecked;
    ((n = ne(t.value != null ? t.value : n)),
      (e._wrapperState = {
        initialChecked: r,
        initialValue: n,
        controlled:
          t.type === "checkbox" || t.type === "radio"
            ? t.checked != null
            : t.value != null,
      }));
  }
  function Lr(e, t) {
    ((t = t.checked), t != null && ve(e, "checked", t, !1));
  }
  function Hn(e, t) {
    Lr(e, t);
    var n = ne(t.value),
      r = t.type;
    if (n != null)
      r === "number"
        ? ((n === 0 && e.value === "") || e.value != n) && (e.value = "" + n)
        : e.value !== "" + n && (e.value = "" + n);
    else if (r === "submit" || r === "reset") {
      e.removeAttribute("value");
      return;
    }
    (t.hasOwnProperty("value")
      ? yn(e, t.type, n)
      : t.hasOwnProperty("defaultValue") && yn(e, t.type, ne(t.defaultValue)),
      t.checked == null &&
        t.defaultChecked != null &&
        (e.defaultChecked = !!t.defaultChecked));
  }
  function gn(e, t, n) {
    if (t.hasOwnProperty("value") || t.hasOwnProperty("defaultValue")) {
      var r = t.type;
      if (
        !(
          (r !== "submit" && r !== "reset") ||
          (t.value !== void 0 && t.value !== null)
        )
      )
        return;
      ((t = "" + e._wrapperState.initialValue),
        n || t === e.value || (e.value = t),
        (e.defaultValue = t));
    }
    ((n = e.name),
      n !== "" && (e.name = ""),
      (e.defaultChecked = !!e._wrapperState.initialChecked),
      n !== "" && (e.name = n));
  }
  function yn(e, t, n) {
    (t !== "number" || en(e.ownerDocument) !== e) &&
      (n == null
        ? (e.defaultValue = "" + e._wrapperState.initialValue)
        : e.defaultValue !== "" + n && (e.defaultValue = "" + n));
  }
  var It = Array.isArray;
  function Ct(e, t, n, r) {
    if (((e = e.options), t)) {
      t = {};
      for (var l = 0; l < n.length; l++) t["$" + n[l]] = !0;
      for (n = 0; n < e.length; n++)
        ((l = t.hasOwnProperty("$" + e[n].value)),
          e[n].selected !== l && (e[n].selected = l),
          l && r && (e[n].defaultSelected = !0));
    } else {
      for (n = "" + ne(n), t = null, l = 0; l < e.length; l++) {
        if (e[l].value === n) {
          ((e[l].selected = !0), r && (e[l].defaultSelected = !0));
          return;
        }
        t !== null || e[l].disabled || (t = e[l]);
      }
      t !== null && (t.selected = !0);
    }
  }
  function vn(e, t) {
    if (t.dangerouslySetInnerHTML != null) throw Error(d(91));
    return m({}, t, {
      value: void 0,
      defaultValue: void 0,
      children: "" + e._wrapperState.initialValue,
    });
  }
  function Ui(e, t) {
    var n = t.value;
    if (n == null) {
      if (((n = t.children), (t = t.defaultValue), n != null)) {
        if (t != null) throw Error(d(92));
        if (It(n)) {
          if (1 < n.length) throw Error(d(93));
          n = n[0];
        }
        t = n;
      }
      (t == null && (t = ""), (n = t));
    }
    e._wrapperState = { initialValue: ne(n) };
  }
  function $i(e, t) {
    var n = ne(t.value),
      r = ne(t.defaultValue);
    (n != null &&
      ((n = "" + n),
      n !== e.value && (e.value = n),
      t.defaultValue == null && e.defaultValue !== n && (e.defaultValue = n)),
      r != null && (e.defaultValue = "" + r));
  }
  function Wi(e) {
    var t = e.textContent;
    t === e._wrapperState.initialValue &&
      t !== "" &&
      t !== null &&
      (e.value = t);
  }
  function Vi(e) {
    switch (e) {
      case "svg":
        return "http://www.w3.org/2000/svg";
      case "math":
        return "http://www.w3.org/1998/Math/MathML";
      default:
        return "http://www.w3.org/1999/xhtml";
    }
  }
  function Vl(e, t) {
    return e == null || e === "http://www.w3.org/1999/xhtml"
      ? Vi(t)
      : e === "http://www.w3.org/2000/svg" && t === "foreignObject"
        ? "http://www.w3.org/1999/xhtml"
        : e;
  }
  var Or,
    Hi = (function (e) {
      return typeof MSApp < "u" && MSApp.execUnsafeLocalFunction
        ? function (t, n, r, l) {
            MSApp.execUnsafeLocalFunction(function () {
              return e(t, n, r, l);
            });
          }
        : e;
    })(function (e, t) {
      if (e.namespaceURI !== "http://www.w3.org/2000/svg" || "innerHTML" in e)
        e.innerHTML = t;
      else {
        for (
          Or = Or || document.createElement("div"),
            Or.innerHTML = "<svg>" + t.valueOf().toString() + "</svg>",
            t = Or.firstChild;
          e.firstChild;
        )
          e.removeChild(e.firstChild);
        for (; t.firstChild; ) e.appendChild(t.firstChild);
      }
    });
  function Qn(e, t) {
    if (t) {
      var n = e.firstChild;
      if (n && n === e.lastChild && n.nodeType === 3) {
        n.nodeValue = t;
        return;
      }
    }
    e.textContent = t;
  }
  var Yn = {
      animationIterationCount: !0,
      aspectRatio: !0,
      borderImageOutset: !0,
      borderImageSlice: !0,
      borderImageWidth: !0,
      boxFlex: !0,
      boxFlexGroup: !0,
      boxOrdinalGroup: !0,
      columnCount: !0,
      columns: !0,
      flex: !0,
      flexGrow: !0,
      flexPositive: !0,
      flexShrink: !0,
      flexNegative: !0,
      flexOrder: !0,
      gridArea: !0,
      gridRow: !0,
      gridRowEnd: !0,
      gridRowSpan: !0,
      gridRowStart: !0,
      gridColumn: !0,
      gridColumnEnd: !0,
      gridColumnSpan: !0,
      gridColumnStart: !0,
      fontWeight: !0,
      lineClamp: !0,
      lineHeight: !0,
      opacity: !0,
      order: !0,
      orphans: !0,
      tabSize: !0,
      widows: !0,
      zIndex: !0,
      zoom: !0,
      fillOpacity: !0,
      floodOpacity: !0,
      stopOpacity: !0,
      strokeDasharray: !0,
      strokeDashoffset: !0,
      strokeMiterlimit: !0,
      strokeOpacity: !0,
      strokeWidth: !0,
    },
    Wa = ["Webkit", "ms", "Moz", "O"];
  Object.keys(Yn).forEach(function (e) {
    Wa.forEach(function (t) {
      ((t = t + e.charAt(0).toUpperCase() + e.substring(1)), (Yn[t] = Yn[e]));
    });
  });
  function Qi(e, t, n) {
    return t == null || typeof t == "boolean" || t === ""
      ? ""
      : n || typeof t != "number" || t === 0 || (Yn.hasOwnProperty(e) && Yn[e])
        ? ("" + t).trim()
        : t + "px";
  }
  function Yi(e, t) {
    e = e.style;
    for (var n in t)
      if (t.hasOwnProperty(n)) {
        var r = n.indexOf("--") === 0,
          l = Qi(n, t[n], r);
        (n === "float" && (n = "cssFloat"),
          r ? e.setProperty(n, l) : (e[n] = l));
      }
  }
  var Va = m(
    { menuitem: !0 },
    {
      area: !0,
      base: !0,
      br: !0,
      col: !0,
      embed: !0,
      hr: !0,
      img: !0,
      input: !0,
      keygen: !0,
      link: !0,
      meta: !0,
      param: !0,
      source: !0,
      track: !0,
      wbr: !0,
    },
  );
  function Hl(e, t) {
    if (t) {
      if (Va[e] && (t.children != null || t.dangerouslySetInnerHTML != null))
        throw Error(d(137, e));
      if (t.dangerouslySetInnerHTML != null) {
        if (t.children != null) throw Error(d(60));
        if (
          typeof t.dangerouslySetInnerHTML != "object" ||
          !("__html" in t.dangerouslySetInnerHTML)
        )
          throw Error(d(61));
      }
      if (t.style != null && typeof t.style != "object") throw Error(d(62));
    }
  }
  function Ql(e, t) {
    if (e.indexOf("-") === -1) return typeof t.is == "string";
    switch (e) {
      case "annotation-xml":
      case "color-profile":
      case "font-face":
      case "font-face-src":
      case "font-face-uri":
      case "font-face-format":
      case "font-face-name":
      case "missing-glyph":
        return !1;
      default:
        return !0;
    }
  }
  var Yl = null;
  function Gl(e) {
    return (
      (e = e.target || e.srcElement || window),
      e.correspondingUseElement && (e = e.correspondingUseElement),
      e.nodeType === 3 ? e.parentNode : e
    );
  }
  var Kl = null,
    Sn = null,
    xn = null;
  function Gi(e) {
    if ((e = hr(e))) {
      if (typeof Kl != "function") throw Error(d(280));
      var t = e.stateNode;
      t && ((t = nl(t)), Kl(e.stateNode, e.type, t));
    }
  }
  function Ki(e) {
    Sn ? (xn ? xn.push(e) : (xn = [e])) : (Sn = e);
  }
  function Xi() {
    if (Sn) {
      var e = Sn,
        t = xn;
      if (((xn = Sn = null), Gi(e), t)) for (e = 0; e < t.length; e++) Gi(t[e]);
    }
  }
  function Ji(e, t) {
    return e(t);
  }
  function Zi() {}
  var Xl = !1;
  function qi(e, t, n) {
    if (Xl) return e(t, n);
    Xl = !0;
    try {
      return Ji(e, t, n);
    } finally {
      ((Xl = !1), (Sn !== null || xn !== null) && (Zi(), Xi()));
    }
  }
  function Gn(e, t) {
    var n = e.stateNode;
    if (n === null) return null;
    var r = nl(n);
    if (r === null) return null;
    n = r[t];
    e: switch (t) {
      case "onClick":
      case "onClickCapture":
      case "onDoubleClick":
      case "onDoubleClickCapture":
      case "onMouseDown":
      case "onMouseDownCapture":
      case "onMouseMove":
      case "onMouseMoveCapture":
      case "onMouseUp":
      case "onMouseUpCapture":
      case "onMouseEnter":
        ((r = !r.disabled) ||
          ((e = e.type),
          (r = !(
            e === "button" ||
            e === "input" ||
            e === "select" ||
            e === "textarea"
          ))),
          (e = !r));
        break e;
      default:
        e = !1;
    }
    if (e) return null;
    if (n && typeof n != "function") throw Error(d(231, t, typeof n));
    return n;
  }
  var Jl = !1;
  if (_)
    try {
      var Kn = {};
      (Object.defineProperty(Kn, "passive", {
        get: function () {
          Jl = !0;
        },
      }),
        window.addEventListener("test", Kn, Kn),
        window.removeEventListener("test", Kn, Kn));
    } catch {
      Jl = !1;
    }
  function Ha(e, t, n, r, l, o, i, u, a) {
    var g = Array.prototype.slice.call(arguments, 3);
    try {
      t.apply(n, g);
    } catch (w) {
      this.onError(w);
    }
  }
  var Xn = !1,
    Ir = null,
    Mr = !1,
    Zl = null,
    Qa = {
      onError: function (e) {
        ((Xn = !0), (Ir = e));
      },
    };
  function Ya(e, t, n, r, l, o, i, u, a) {
    ((Xn = !1), (Ir = null), Ha.apply(Qa, arguments));
  }
  function Ga(e, t, n, r, l, o, i, u, a) {
    if ((Ya.apply(this, arguments), Xn)) {
      if (Xn) {
        var g = Ir;
        ((Xn = !1), (Ir = null));
      } else throw Error(d(198));
      Mr || ((Mr = !0), (Zl = g));
    }
  }
  function tn(e) {
    var t = e,
      n = e;
    if (e.alternate) for (; t.return; ) t = t.return;
    else {
      e = t;
      do ((t = e), (t.flags & 4098) !== 0 && (n = t.return), (e = t.return));
      while (e);
    }
    return t.tag === 3 ? n : null;
  }
  function bi(e) {
    if (e.tag === 13) {
      var t = e.memoizedState;
      if (
        (t === null && ((e = e.alternate), e !== null && (t = e.memoizedState)),
        t !== null)
      )
        return t.dehydrated;
    }
    return null;
  }
  function eu(e) {
    if (tn(e) !== e) throw Error(d(188));
  }
  function Ka(e) {
    var t = e.alternate;
    if (!t) {
      if (((t = tn(e)), t === null)) throw Error(d(188));
      return t !== e ? null : e;
    }
    for (var n = e, r = t; ; ) {
      var l = n.return;
      if (l === null) break;
      var o = l.alternate;
      if (o === null) {
        if (((r = l.return), r !== null)) {
          n = r;
          continue;
        }
        break;
      }
      if (l.child === o.child) {
        for (o = l.child; o; ) {
          if (o === n) return (eu(l), e);
          if (o === r) return (eu(l), t);
          o = o.sibling;
        }
        throw Error(d(188));
      }
      if (n.return !== r.return) ((n = l), (r = o));
      else {
        for (var i = !1, u = l.child; u; ) {
          if (u === n) {
            ((i = !0), (n = l), (r = o));
            break;
          }
          if (u === r) {
            ((i = !0), (r = l), (n = o));
            break;
          }
          u = u.sibling;
        }
        if (!i) {
          for (u = o.child; u; ) {
            if (u === n) {
              ((i = !0), (n = o), (r = l));
              break;
            }
            if (u === r) {
              ((i = !0), (r = o), (n = l));
              break;
            }
            u = u.sibling;
          }
          if (!i) throw Error(d(189));
        }
      }
      if (n.alternate !== r) throw Error(d(190));
    }
    if (n.tag !== 3) throw Error(d(188));
    return n.stateNode.current === n ? e : t;
  }
  function tu(e) {
    return ((e = Ka(e)), e !== null ? nu(e) : null);
  }
  function nu(e) {
    if (e.tag === 5 || e.tag === 6) return e;
    for (e = e.child; e !== null; ) {
      var t = nu(e);
      if (t !== null) return t;
      e = e.sibling;
    }
    return null;
  }
  var ru = S.unstable_scheduleCallback,
    lu = S.unstable_cancelCallback,
    Xa = S.unstable_shouldYield,
    Ja = S.unstable_requestPaint,
    ke = S.unstable_now,
    Za = S.unstable_getCurrentPriorityLevel,
    ql = S.unstable_ImmediatePriority,
    ou = S.unstable_UserBlockingPriority,
    Dr = S.unstable_NormalPriority,
    qa = S.unstable_LowPriority,
    iu = S.unstable_IdlePriority,
    Fr = null,
    vt = null;
  function ba(e) {
    if (vt && typeof vt.onCommitFiberRoot == "function")
      try {
        vt.onCommitFiberRoot(Fr, e, void 0, (e.current.flags & 128) === 128);
      } catch {}
  }
  var ft = Math.clz32 ? Math.clz32 : nc,
    ec = Math.log,
    tc = Math.LN2;
  function nc(e) {
    return ((e >>>= 0), e === 0 ? 32 : (31 - ((ec(e) / tc) | 0)) | 0);
  }
  var Ar = 64,
    Br = 4194304;
  function Jn(e) {
    switch (e & -e) {
      case 1:
        return 1;
      case 2:
        return 2;
      case 4:
        return 4;
      case 8:
        return 8;
      case 16:
        return 16;
      case 32:
        return 32;
      case 64:
      case 128:
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
        return e & 4194240;
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
      case 67108864:
        return e & 130023424;
      case 134217728:
        return 134217728;
      case 268435456:
        return 268435456;
      case 536870912:
        return 536870912;
      case 1073741824:
        return 1073741824;
      default:
        return e;
    }
  }
  function Ur(e, t) {
    var n = e.pendingLanes;
    if (n === 0) return 0;
    var r = 0,
      l = e.suspendedLanes,
      o = e.pingedLanes,
      i = n & 268435455;
    if (i !== 0) {
      var u = i & ~l;
      u !== 0 ? (r = Jn(u)) : ((o &= i), o !== 0 && (r = Jn(o)));
    } else ((i = n & ~l), i !== 0 ? (r = Jn(i)) : o !== 0 && (r = Jn(o)));
    if (r === 0) return 0;
    if (
      t !== 0 &&
      t !== r &&
      (t & l) === 0 &&
      ((l = r & -r), (o = t & -t), l >= o || (l === 16 && (o & 4194240) !== 0))
    )
      return t;
    if (((r & 4) !== 0 && (r |= n & 16), (t = e.entangledLanes), t !== 0))
      for (e = e.entanglements, t &= r; 0 < t; )
        ((n = 31 - ft(t)), (l = 1 << n), (r |= e[n]), (t &= ~l));
    return r;
  }
  function rc(e, t) {
    switch (e) {
      case 1:
      case 2:
      case 4:
        return t + 250;
      case 8:
      case 16:
      case 32:
      case 64:
      case 128:
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
        return t + 5e3;
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
      case 67108864:
        return -1;
      case 134217728:
      case 268435456:
      case 536870912:
      case 1073741824:
        return -1;
      default:
        return -1;
    }
  }
  function lc(e, t) {
    for (
      var n = e.suspendedLanes,
        r = e.pingedLanes,
        l = e.expirationTimes,
        o = e.pendingLanes;
      0 < o;
    ) {
      var i = 31 - ft(o),
        u = 1 << i,
        a = l[i];
      (a === -1
        ? ((u & n) === 0 || (u & r) !== 0) && (l[i] = rc(u, t))
        : a <= t && (e.expiredLanes |= u),
        (o &= ~u));
    }
  }
  function bl(e) {
    return (
      (e = e.pendingLanes & -1073741825),
      e !== 0 ? e : e & 1073741824 ? 1073741824 : 0
    );
  }
  function uu() {
    var e = Ar;
    return ((Ar <<= 1), (Ar & 4194240) === 0 && (Ar = 64), e);
  }
  function eo(e) {
    for (var t = [], n = 0; 31 > n; n++) t.push(e);
    return t;
  }
  function Zn(e, t, n) {
    ((e.pendingLanes |= t),
      t !== 536870912 && ((e.suspendedLanes = 0), (e.pingedLanes = 0)),
      (e = e.eventTimes),
      (t = 31 - ft(t)),
      (e[t] = n));
  }
  function oc(e, t) {
    var n = e.pendingLanes & ~t;
    ((e.pendingLanes = t),
      (e.suspendedLanes = 0),
      (e.pingedLanes = 0),
      (e.expiredLanes &= t),
      (e.mutableReadLanes &= t),
      (e.entangledLanes &= t),
      (t = e.entanglements));
    var r = e.eventTimes;
    for (e = e.expirationTimes; 0 < n; ) {
      var l = 31 - ft(n),
        o = 1 << l;
      ((t[l] = 0), (r[l] = -1), (e[l] = -1), (n &= ~o));
    }
  }
  function to(e, t) {
    var n = (e.entangledLanes |= t);
    for (e = e.entanglements; n; ) {
      var r = 31 - ft(n),
        l = 1 << r;
      ((l & t) | (e[r] & t) && (e[r] |= t), (n &= ~l));
    }
  }
  var ue = 0;
  function su(e) {
    return (
      (e &= -e),
      1 < e ? (4 < e ? ((e & 268435455) !== 0 ? 16 : 536870912) : 4) : 1
    );
  }
  var au,
    no,
    cu,
    fu,
    du,
    ro = !1,
    $r = [],
    Mt = null,
    Dt = null,
    Ft = null,
    qn = new Map(),
    bn = new Map(),
    At = [],
    ic =
      "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(
        " ",
      );
  function pu(e, t) {
    switch (e) {
      case "focusin":
      case "focusout":
        Mt = null;
        break;
      case "dragenter":
      case "dragleave":
        Dt = null;
        break;
      case "mouseover":
      case "mouseout":
        Ft = null;
        break;
      case "pointerover":
      case "pointerout":
        qn.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        bn.delete(t.pointerId);
    }
  }
  function er(e, t, n, r, l, o) {
    return e === null || e.nativeEvent !== o
      ? ((e = {
          blockedOn: t,
          domEventName: n,
          eventSystemFlags: r,
          nativeEvent: o,
          targetContainers: [l],
        }),
        t !== null && ((t = hr(t)), t !== null && no(t)),
        e)
      : ((e.eventSystemFlags |= r),
        (t = e.targetContainers),
        l !== null && t.indexOf(l) === -1 && t.push(l),
        e);
  }
  function uc(e, t, n, r, l) {
    switch (t) {
      case "focusin":
        return ((Mt = er(Mt, e, t, n, r, l)), !0);
      case "dragenter":
        return ((Dt = er(Dt, e, t, n, r, l)), !0);
      case "mouseover":
        return ((Ft = er(Ft, e, t, n, r, l)), !0);
      case "pointerover":
        var o = l.pointerId;
        return (qn.set(o, er(qn.get(o) || null, e, t, n, r, l)), !0);
      case "gotpointercapture":
        return (
          (o = l.pointerId),
          bn.set(o, er(bn.get(o) || null, e, t, n, r, l)),
          !0
        );
    }
    return !1;
  }
  function hu(e) {
    var t = nn(e.target);
    if (t !== null) {
      var n = tn(t);
      if (n !== null) {
        if (((t = n.tag), t === 13)) {
          if (((t = bi(n)), t !== null)) {
            ((e.blockedOn = t),
              du(e.priority, function () {
                cu(n);
              }));
            return;
          }
        } else if (t === 3 && n.stateNode.current.memoizedState.isDehydrated) {
          e.blockedOn = n.tag === 3 ? n.stateNode.containerInfo : null;
          return;
        }
      }
    }
    e.blockedOn = null;
  }
  function Wr(e) {
    if (e.blockedOn !== null) return !1;
    for (var t = e.targetContainers; 0 < t.length; ) {
      var n = oo(e.domEventName, e.eventSystemFlags, t[0], e.nativeEvent);
      if (n === null) {
        n = e.nativeEvent;
        var r = new n.constructor(n.type, n);
        ((Yl = r), n.target.dispatchEvent(r), (Yl = null));
      } else return ((t = hr(n)), t !== null && no(t), (e.blockedOn = n), !1);
      t.shift();
    }
    return !0;
  }
  function mu(e, t, n) {
    Wr(e) && n.delete(t);
  }
  function sc() {
    ((ro = !1),
      Mt !== null && Wr(Mt) && (Mt = null),
      Dt !== null && Wr(Dt) && (Dt = null),
      Ft !== null && Wr(Ft) && (Ft = null),
      qn.forEach(mu),
      bn.forEach(mu));
  }
  function tr(e, t) {
    e.blockedOn === t &&
      ((e.blockedOn = null),
      ro ||
        ((ro = !0),
        S.unstable_scheduleCallback(S.unstable_NormalPriority, sc)));
  }
  function nr(e) {
    function t(l) {
      return tr(l, e);
    }
    if (0 < $r.length) {
      tr($r[0], e);
      for (var n = 1; n < $r.length; n++) {
        var r = $r[n];
        r.blockedOn === e && (r.blockedOn = null);
      }
    }
    for (
      Mt !== null && tr(Mt, e),
        Dt !== null && tr(Dt, e),
        Ft !== null && tr(Ft, e),
        qn.forEach(t),
        bn.forEach(t),
        n = 0;
      n < At.length;
      n++
    )
      ((r = At[n]), r.blockedOn === e && (r.blockedOn = null));
    for (; 0 < At.length && ((n = At[0]), n.blockedOn === null); )
      (hu(n), n.blockedOn === null && At.shift());
  }
  var wn = se.ReactCurrentBatchConfig,
    Vr = !0;
  function ac(e, t, n, r) {
    var l = ue,
      o = wn.transition;
    wn.transition = null;
    try {
      ((ue = 1), lo(e, t, n, r));
    } finally {
      ((ue = l), (wn.transition = o));
    }
  }
  function cc(e, t, n, r) {
    var l = ue,
      o = wn.transition;
    wn.transition = null;
    try {
      ((ue = 4), lo(e, t, n, r));
    } finally {
      ((ue = l), (wn.transition = o));
    }
  }
  function lo(e, t, n, r) {
    if (Vr) {
      var l = oo(e, t, n, r);
      if (l === null) (Eo(e, t, r, Hr, n), pu(e, r));
      else if (uc(l, e, t, n, r)) r.stopPropagation();
      else if ((pu(e, r), t & 4 && -1 < ic.indexOf(e))) {
        for (; l !== null; ) {
          var o = hr(l);
          if (
            (o !== null && au(o),
            (o = oo(e, t, n, r)),
            o === null && Eo(e, t, r, Hr, n),
            o === l)
          )
            break;
          l = o;
        }
        l !== null && r.stopPropagation();
      } else Eo(e, t, r, null, n);
    }
  }
  var Hr = null;
  function oo(e, t, n, r) {
    if (((Hr = null), (e = Gl(r)), (e = nn(e)), e !== null))
      if (((t = tn(e)), t === null)) e = null;
      else if (((n = t.tag), n === 13)) {
        if (((e = bi(t)), e !== null)) return e;
        e = null;
      } else if (n === 3) {
        if (t.stateNode.current.memoizedState.isDehydrated)
          return t.tag === 3 ? t.stateNode.containerInfo : null;
        e = null;
      } else t !== e && (e = null);
    return ((Hr = e), null);
  }
  function gu(e) {
    switch (e) {
      case "cancel":
      case "click":
      case "close":
      case "contextmenu":
      case "copy":
      case "cut":
      case "auxclick":
      case "dblclick":
      case "dragend":
      case "dragstart":
      case "drop":
      case "focusin":
      case "focusout":
      case "input":
      case "invalid":
      case "keydown":
      case "keypress":
      case "keyup":
      case "mousedown":
      case "mouseup":
      case "paste":
      case "pause":
      case "play":
      case "pointercancel":
      case "pointerdown":
      case "pointerup":
      case "ratechange":
      case "reset":
      case "resize":
      case "seeked":
      case "submit":
      case "touchcancel":
      case "touchend":
      case "touchstart":
      case "volumechange":
      case "change":
      case "selectionchange":
      case "textInput":
      case "compositionstart":
      case "compositionend":
      case "compositionupdate":
      case "beforeblur":
      case "afterblur":
      case "beforeinput":
      case "blur":
      case "fullscreenchange":
      case "focus":
      case "hashchange":
      case "popstate":
      case "select":
      case "selectstart":
        return 1;
      case "drag":
      case "dragenter":
      case "dragexit":
      case "dragleave":
      case "dragover":
      case "mousemove":
      case "mouseout":
      case "mouseover":
      case "pointermove":
      case "pointerout":
      case "pointerover":
      case "scroll":
      case "toggle":
      case "touchmove":
      case "wheel":
      case "mouseenter":
      case "mouseleave":
      case "pointerenter":
      case "pointerleave":
        return 4;
      case "message":
        switch (Za()) {
          case ql:
            return 1;
          case ou:
            return 4;
          case Dr:
          case qa:
            return 16;
          case iu:
            return 536870912;
          default:
            return 16;
        }
      default:
        return 16;
    }
  }
  var Bt = null,
    io = null,
    Qr = null;
  function yu() {
    if (Qr) return Qr;
    var e,
      t = io,
      n = t.length,
      r,
      l = "value" in Bt ? Bt.value : Bt.textContent,
      o = l.length;
    for (e = 0; e < n && t[e] === l[e]; e++);
    var i = n - e;
    for (r = 1; r <= i && t[n - r] === l[o - r]; r++);
    return (Qr = l.slice(e, 1 < r ? 1 - r : void 0));
  }
  function Yr(e) {
    var t = e.keyCode;
    return (
      "charCode" in e
        ? ((e = e.charCode), e === 0 && t === 13 && (e = 13))
        : (e = t),
      e === 10 && (e = 13),
      32 <= e || e === 13 ? e : 0
    );
  }
  function Gr() {
    return !0;
  }
  function vu() {
    return !1;
  }
  function be(e) {
    function t(n, r, l, o, i) {
      ((this._reactName = n),
        (this._targetInst = l),
        (this.type = r),
        (this.nativeEvent = o),
        (this.target = i),
        (this.currentTarget = null));
      for (var u in e)
        e.hasOwnProperty(u) && ((n = e[u]), (this[u] = n ? n(o) : o[u]));
      return (
        (this.isDefaultPrevented = (
          o.defaultPrevented != null ? o.defaultPrevented : o.returnValue === !1
        )
          ? Gr
          : vu),
        (this.isPropagationStopped = vu),
        this
      );
    }
    return (
      m(t.prototype, {
        preventDefault: function () {
          this.defaultPrevented = !0;
          var n = this.nativeEvent;
          n &&
            (n.preventDefault
              ? n.preventDefault()
              : typeof n.returnValue != "unknown" && (n.returnValue = !1),
            (this.isDefaultPrevented = Gr));
        },
        stopPropagation: function () {
          var n = this.nativeEvent;
          n &&
            (n.stopPropagation
              ? n.stopPropagation()
              : typeof n.cancelBubble != "unknown" && (n.cancelBubble = !0),
            (this.isPropagationStopped = Gr));
        },
        persist: function () {},
        isPersistent: Gr,
      }),
      t
    );
  }
  var kn = {
      eventPhase: 0,
      bubbles: 0,
      cancelable: 0,
      timeStamp: function (e) {
        return e.timeStamp || Date.now();
      },
      defaultPrevented: 0,
      isTrusted: 0,
    },
    uo = be(kn),
    rr = m({}, kn, { view: 0, detail: 0 }),
    fc = be(rr),
    so,
    ao,
    lr,
    Kr = m({}, rr, {
      screenX: 0,
      screenY: 0,
      clientX: 0,
      clientY: 0,
      pageX: 0,
      pageY: 0,
      ctrlKey: 0,
      shiftKey: 0,
      altKey: 0,
      metaKey: 0,
      getModifierState: fo,
      button: 0,
      buttons: 0,
      relatedTarget: function (e) {
        return e.relatedTarget === void 0
          ? e.fromElement === e.srcElement
            ? e.toElement
            : e.fromElement
          : e.relatedTarget;
      },
      movementX: function (e) {
        return "movementX" in e
          ? e.movementX
          : (e !== lr &&
              (lr && e.type === "mousemove"
                ? ((so = e.screenX - lr.screenX), (ao = e.screenY - lr.screenY))
                : (ao = so = 0),
              (lr = e)),
            so);
      },
      movementY: function (e) {
        return "movementY" in e ? e.movementY : ao;
      },
    }),
    Su = be(Kr),
    dc = m({}, Kr, { dataTransfer: 0 }),
    pc = be(dc),
    hc = m({}, rr, { relatedTarget: 0 }),
    co = be(hc),
    mc = m({}, kn, { animationName: 0, elapsedTime: 0, pseudoElement: 0 }),
    gc = be(mc),
    yc = m({}, kn, {
      clipboardData: function (e) {
        return "clipboardData" in e ? e.clipboardData : window.clipboardData;
      },
    }),
    vc = be(yc),
    Sc = m({}, kn, { data: 0 }),
    xu = be(Sc),
    xc = {
      Esc: "Escape",
      Spacebar: " ",
      Left: "ArrowLeft",
      Up: "ArrowUp",
      Right: "ArrowRight",
      Down: "ArrowDown",
      Del: "Delete",
      Win: "OS",
      Menu: "ContextMenu",
      Apps: "ContextMenu",
      Scroll: "ScrollLock",
      MozPrintableKey: "Unidentified",
    },
    wc = {
      8: "Backspace",
      9: "Tab",
      12: "Clear",
      13: "Enter",
      16: "Shift",
      17: "Control",
      18: "Alt",
      19: "Pause",
      20: "CapsLock",
      27: "Escape",
      32: " ",
      33: "PageUp",
      34: "PageDown",
      35: "End",
      36: "Home",
      37: "ArrowLeft",
      38: "ArrowUp",
      39: "ArrowRight",
      40: "ArrowDown",
      45: "Insert",
      46: "Delete",
      112: "F1",
      113: "F2",
      114: "F3",
      115: "F4",
      116: "F5",
      117: "F6",
      118: "F7",
      119: "F8",
      120: "F9",
      121: "F10",
      122: "F11",
      123: "F12",
      144: "NumLock",
      145: "ScrollLock",
      224: "Meta",
    },
    kc = {
      Alt: "altKey",
      Control: "ctrlKey",
      Meta: "metaKey",
      Shift: "shiftKey",
    };
  function Ec(e) {
    var t = this.nativeEvent;
    return t.getModifierState
      ? t.getModifierState(e)
      : (e = kc[e])
        ? !!t[e]
        : !1;
  }
  function fo() {
    return Ec;
  }
  var _c = m({}, rr, {
      key: function (e) {
        if (e.key) {
          var t = xc[e.key] || e.key;
          if (t !== "Unidentified") return t;
        }
        return e.type === "keypress"
          ? ((e = Yr(e)), e === 13 ? "Enter" : String.fromCharCode(e))
          : e.type === "keydown" || e.type === "keyup"
            ? wc[e.keyCode] || "Unidentified"
            : "";
      },
      code: 0,
      location: 0,
      ctrlKey: 0,
      shiftKey: 0,
      altKey: 0,
      metaKey: 0,
      repeat: 0,
      locale: 0,
      getModifierState: fo,
      charCode: function (e) {
        return e.type === "keypress" ? Yr(e) : 0;
      },
      keyCode: function (e) {
        return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
      },
      which: function (e) {
        return e.type === "keypress"
          ? Yr(e)
          : e.type === "keydown" || e.type === "keyup"
            ? e.keyCode
            : 0;
      },
    }),
    Cc = be(_c),
    jc = m({}, Kr, {
      pointerId: 0,
      width: 0,
      height: 0,
      pressure: 0,
      tangentialPressure: 0,
      tiltX: 0,
      tiltY: 0,
      twist: 0,
      pointerType: 0,
      isPrimary: 0,
    }),
    wu = be(jc),
    Pc = m({}, rr, {
      touches: 0,
      targetTouches: 0,
      changedTouches: 0,
      altKey: 0,
      metaKey: 0,
      ctrlKey: 0,
      shiftKey: 0,
      getModifierState: fo,
    }),
    zc = be(Pc),
    Tc = m({}, kn, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 }),
    Rc = be(Tc),
    Nc = m({}, Kr, {
      deltaX: function (e) {
        return "deltaX" in e
          ? e.deltaX
          : "wheelDeltaX" in e
            ? -e.wheelDeltaX
            : 0;
      },
      deltaY: function (e) {
        return "deltaY" in e
          ? e.deltaY
          : "wheelDeltaY" in e
            ? -e.wheelDeltaY
            : "wheelDelta" in e
              ? -e.wheelDelta
              : 0;
      },
      deltaZ: 0,
      deltaMode: 0,
    }),
    Lc = be(Nc),
    Oc = [9, 13, 27, 32],
    po = _ && "CompositionEvent" in window,
    or = null;
  _ && "documentMode" in document && (or = document.documentMode);
  var Ic = _ && "TextEvent" in window && !or,
    ku = _ && (!po || (or && 8 < or && 11 >= or)),
    Eu = " ",
    _u = !1;
  function Cu(e, t) {
    switch (e) {
      case "keyup":
        return Oc.indexOf(t.keyCode) !== -1;
      case "keydown":
        return t.keyCode !== 229;
      case "keypress":
      case "mousedown":
      case "focusout":
        return !0;
      default:
        return !1;
    }
  }
  function ju(e) {
    return (
      (e = e.detail),
      typeof e == "object" && "data" in e ? e.data : null
    );
  }
  var En = !1;
  function Mc(e, t) {
    switch (e) {
      case "compositionend":
        return ju(t);
      case "keypress":
        return t.which !== 32 ? null : ((_u = !0), Eu);
      case "textInput":
        return ((e = t.data), e === Eu && _u ? null : e);
      default:
        return null;
    }
  }
  function Dc(e, t) {
    if (En)
      return e === "compositionend" || (!po && Cu(e, t))
        ? ((e = yu()), (Qr = io = Bt = null), (En = !1), e)
        : null;
    switch (e) {
      case "paste":
        return null;
      case "keypress":
        if (!(t.ctrlKey || t.altKey || t.metaKey) || (t.ctrlKey && t.altKey)) {
          if (t.char && 1 < t.char.length) return t.char;
          if (t.which) return String.fromCharCode(t.which);
        }
        return null;
      case "compositionend":
        return ku && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var Fc = {
    color: !0,
    date: !0,
    datetime: !0,
    "datetime-local": !0,
    email: !0,
    month: !0,
    number: !0,
    password: !0,
    range: !0,
    search: !0,
    tel: !0,
    text: !0,
    time: !0,
    url: !0,
    week: !0,
  };
  function Pu(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t === "input" ? !!Fc[e.type] : t === "textarea";
  }
  function zu(e, t, n, r) {
    (Ki(r),
      (t = br(t, "onChange")),
      0 < t.length &&
        ((n = new uo("onChange", "change", null, n, r)),
        e.push({ event: n, listeners: t })));
  }
  var ir = null,
    ur = null;
  function Ac(e) {
    Yu(e, 0);
  }
  function Xr(e) {
    var t = zn(e);
    if (_t(t)) return e;
  }
  function Bc(e, t) {
    if (e === "change") return t;
  }
  var Tu = !1;
  if (_) {
    var ho;
    if (_) {
      var mo = "oninput" in document;
      if (!mo) {
        var Ru = document.createElement("div");
        (Ru.setAttribute("oninput", "return;"),
          (mo = typeof Ru.oninput == "function"));
      }
      ho = mo;
    } else ho = !1;
    Tu = ho && (!document.documentMode || 9 < document.documentMode);
  }
  function Nu() {
    ir && (ir.detachEvent("onpropertychange", Lu), (ur = ir = null));
  }
  function Lu(e) {
    if (e.propertyName === "value" && Xr(ur)) {
      var t = [];
      (zu(t, ur, e, Gl(e)), qi(Ac, t));
    }
  }
  function Uc(e, t, n) {
    e === "focusin"
      ? (Nu(), (ir = t), (ur = n), ir.attachEvent("onpropertychange", Lu))
      : e === "focusout" && Nu();
  }
  function $c(e) {
    if (e === "selectionchange" || e === "keyup" || e === "keydown")
      return Xr(ur);
  }
  function Wc(e, t) {
    if (e === "click") return Xr(t);
  }
  function Vc(e, t) {
    if (e === "input" || e === "change") return Xr(t);
  }
  function Hc(e, t) {
    return (e === t && (e !== 0 || 1 / e === 1 / t)) || (e !== e && t !== t);
  }
  var dt = typeof Object.is == "function" ? Object.is : Hc;
  function sr(e, t) {
    if (dt(e, t)) return !0;
    if (
      typeof e != "object" ||
      e === null ||
      typeof t != "object" ||
      t === null
    )
      return !1;
    var n = Object.keys(e),
      r = Object.keys(t);
    if (n.length !== r.length) return !1;
    for (r = 0; r < n.length; r++) {
      var l = n[r];
      if (!M.call(t, l) || !dt(e[l], t[l])) return !1;
    }
    return !0;
  }
  function Ou(e) {
    for (; e && e.firstChild; ) e = e.firstChild;
    return e;
  }
  function Iu(e, t) {
    var n = Ou(e);
    e = 0;
    for (var r; n; ) {
      if (n.nodeType === 3) {
        if (((r = e + n.textContent.length), e <= t && r >= t))
          return { node: n, offset: t - e };
        e = r;
      }
      e: {
        for (; n; ) {
          if (n.nextSibling) {
            n = n.nextSibling;
            break e;
          }
          n = n.parentNode;
        }
        n = void 0;
      }
      n = Ou(n);
    }
  }
  function Mu(e, t) {
    return e && t
      ? e === t
        ? !0
        : e && e.nodeType === 3
          ? !1
          : t && t.nodeType === 3
            ? Mu(e, t.parentNode)
            : "contains" in e
              ? e.contains(t)
              : e.compareDocumentPosition
                ? !!(e.compareDocumentPosition(t) & 16)
                : !1
      : !1;
  }
  function Du() {
    for (var e = window, t = en(); t instanceof e.HTMLIFrameElement; ) {
      try {
        var n = typeof t.contentWindow.location.href == "string";
      } catch {
        n = !1;
      }
      if (n) e = t.contentWindow;
      else break;
      t = en(e.document);
    }
    return t;
  }
  function go(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return (
      t &&
      ((t === "input" &&
        (e.type === "text" ||
          e.type === "search" ||
          e.type === "tel" ||
          e.type === "url" ||
          e.type === "password")) ||
        t === "textarea" ||
        e.contentEditable === "true")
    );
  }
  function Qc(e) {
    var t = Du(),
      n = e.focusedElem,
      r = e.selectionRange;
    if (
      t !== n &&
      n &&
      n.ownerDocument &&
      Mu(n.ownerDocument.documentElement, n)
    ) {
      if (r !== null && go(n)) {
        if (
          ((t = r.start),
          (e = r.end),
          e === void 0 && (e = t),
          "selectionStart" in n)
        )
          ((n.selectionStart = t),
            (n.selectionEnd = Math.min(e, n.value.length)));
        else if (
          ((e = ((t = n.ownerDocument || document) && t.defaultView) || window),
          e.getSelection)
        ) {
          e = e.getSelection();
          var l = n.textContent.length,
            o = Math.min(r.start, l);
          ((r = r.end === void 0 ? o : Math.min(r.end, l)),
            !e.extend && o > r && ((l = r), (r = o), (o = l)),
            (l = Iu(n, o)));
          var i = Iu(n, r);
          l &&
            i &&
            (e.rangeCount !== 1 ||
              e.anchorNode !== l.node ||
              e.anchorOffset !== l.offset ||
              e.focusNode !== i.node ||
              e.focusOffset !== i.offset) &&
            ((t = t.createRange()),
            t.setStart(l.node, l.offset),
            e.removeAllRanges(),
            o > r
              ? (e.addRange(t), e.extend(i.node, i.offset))
              : (t.setEnd(i.node, i.offset), e.addRange(t)));
        }
      }
      for (t = [], e = n; (e = e.parentNode); )
        e.nodeType === 1 &&
          t.push({ element: e, left: e.scrollLeft, top: e.scrollTop });
      for (typeof n.focus == "function" && n.focus(), n = 0; n < t.length; n++)
        ((e = t[n]),
          (e.element.scrollLeft = e.left),
          (e.element.scrollTop = e.top));
    }
  }
  var Yc = _ && "documentMode" in document && 11 >= document.documentMode,
    _n = null,
    yo = null,
    ar = null,
    vo = !1;
  function Fu(e, t, n) {
    var r =
      n.window === n ? n.document : n.nodeType === 9 ? n : n.ownerDocument;
    vo ||
      _n == null ||
      _n !== en(r) ||
      ((r = _n),
      "selectionStart" in r && go(r)
        ? (r = { start: r.selectionStart, end: r.selectionEnd })
        : ((r = (
            (r.ownerDocument && r.ownerDocument.defaultView) ||
            window
          ).getSelection()),
          (r = {
            anchorNode: r.anchorNode,
            anchorOffset: r.anchorOffset,
            focusNode: r.focusNode,
            focusOffset: r.focusOffset,
          })),
      (ar && sr(ar, r)) ||
        ((ar = r),
        (r = br(yo, "onSelect")),
        0 < r.length &&
          ((t = new uo("onSelect", "select", null, t, n)),
          e.push({ event: t, listeners: r }),
          (t.target = _n))));
  }
  function Jr(e, t) {
    var n = {};
    return (
      (n[e.toLowerCase()] = t.toLowerCase()),
      (n["Webkit" + e] = "webkit" + t),
      (n["Moz" + e] = "moz" + t),
      n
    );
  }
  var Cn = {
      animationend: Jr("Animation", "AnimationEnd"),
      animationiteration: Jr("Animation", "AnimationIteration"),
      animationstart: Jr("Animation", "AnimationStart"),
      transitionend: Jr("Transition", "TransitionEnd"),
    },
    So = {},
    Au = {};
  _ &&
    ((Au = document.createElement("div").style),
    "AnimationEvent" in window ||
      (delete Cn.animationend.animation,
      delete Cn.animationiteration.animation,
      delete Cn.animationstart.animation),
    "TransitionEvent" in window || delete Cn.transitionend.transition);
  function Zr(e) {
    if (So[e]) return So[e];
    if (!Cn[e]) return e;
    var t = Cn[e],
      n;
    for (n in t) if (t.hasOwnProperty(n) && n in Au) return (So[e] = t[n]);
    return e;
  }
  var Bu = Zr("animationend"),
    Uu = Zr("animationiteration"),
    $u = Zr("animationstart"),
    Wu = Zr("transitionend"),
    Vu = new Map(),
    Hu =
      "abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(
        " ",
      );
  function Ut(e, t) {
    (Vu.set(e, t), P(t, [e]));
  }
  for (var xo = 0; xo < Hu.length; xo++) {
    var wo = Hu[xo],
      Gc = wo.toLowerCase(),
      Kc = wo[0].toUpperCase() + wo.slice(1);
    Ut(Gc, "on" + Kc);
  }
  (Ut(Bu, "onAnimationEnd"),
    Ut(Uu, "onAnimationIteration"),
    Ut($u, "onAnimationStart"),
    Ut("dblclick", "onDoubleClick"),
    Ut("focusin", "onFocus"),
    Ut("focusout", "onBlur"),
    Ut(Wu, "onTransitionEnd"),
    z("onMouseEnter", ["mouseout", "mouseover"]),
    z("onMouseLeave", ["mouseout", "mouseover"]),
    z("onPointerEnter", ["pointerout", "pointerover"]),
    z("onPointerLeave", ["pointerout", "pointerover"]),
    P(
      "onChange",
      "change click focusin focusout input keydown keyup selectionchange".split(
        " ",
      ),
    ),
    P(
      "onSelect",
      "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(
        " ",
      ),
    ),
    P("onBeforeInput", ["compositionend", "keypress", "textInput", "paste"]),
    P(
      "onCompositionEnd",
      "compositionend focusout keydown keypress keyup mousedown".split(" "),
    ),
    P(
      "onCompositionStart",
      "compositionstart focusout keydown keypress keyup mousedown".split(" "),
    ),
    P(
      "onCompositionUpdate",
      "compositionupdate focusout keydown keypress keyup mousedown".split(" "),
    ));
  var cr =
      "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(
        " ",
      ),
    Xc = new Set(
      "cancel close invalid load scroll toggle".split(" ").concat(cr),
    );
  function Qu(e, t, n) {
    var r = e.type || "unknown-event";
    ((e.currentTarget = n), Ga(r, t, void 0, e), (e.currentTarget = null));
  }
  function Yu(e, t) {
    t = (t & 4) !== 0;
    for (var n = 0; n < e.length; n++) {
      var r = e[n],
        l = r.event;
      r = r.listeners;
      e: {
        var o = void 0;
        if (t)
          for (var i = r.length - 1; 0 <= i; i--) {
            var u = r[i],
              a = u.instance,
              g = u.currentTarget;
            if (((u = u.listener), a !== o && l.isPropagationStopped()))
              break e;
            (Qu(l, u, g), (o = a));
          }
        else
          for (i = 0; i < r.length; i++) {
            if (
              ((u = r[i]),
              (a = u.instance),
              (g = u.currentTarget),
              (u = u.listener),
              a !== o && l.isPropagationStopped())
            )
              break e;
            (Qu(l, u, g), (o = a));
          }
      }
    }
    if (Mr) throw ((e = Zl), (Mr = !1), (Zl = null), e);
  }
  function pe(e, t) {
    var n = t[To];
    n === void 0 && (n = t[To] = new Set());
    var r = e + "__bubble";
    n.has(r) || (Gu(t, e, 2, !1), n.add(r));
  }
  function ko(e, t, n) {
    var r = 0;
    (t && (r |= 4), Gu(n, e, r, t));
  }
  var qr = "_reactListening" + Math.random().toString(36).slice(2);
  function fr(e) {
    if (!e[qr]) {
      ((e[qr] = !0),
        R.forEach(function (n) {
          n !== "selectionchange" && (Xc.has(n) || ko(n, !1, e), ko(n, !0, e));
        }));
      var t = e.nodeType === 9 ? e : e.ownerDocument;
      t === null || t[qr] || ((t[qr] = !0), ko("selectionchange", !1, t));
    }
  }
  function Gu(e, t, n, r) {
    switch (gu(t)) {
      case 1:
        var l = ac;
        break;
      case 4:
        l = cc;
        break;
      default:
        l = lo;
    }
    ((n = l.bind(null, t, n, e)),
      (l = void 0),
      !Jl ||
        (t !== "touchstart" && t !== "touchmove" && t !== "wheel") ||
        (l = !0),
      r
        ? l !== void 0
          ? e.addEventListener(t, n, { capture: !0, passive: l })
          : e.addEventListener(t, n, !0)
        : l !== void 0
          ? e.addEventListener(t, n, { passive: l })
          : e.addEventListener(t, n, !1));
  }
  function Eo(e, t, n, r, l) {
    var o = r;
    if ((t & 1) === 0 && (t & 2) === 0 && r !== null)
      e: for (;;) {
        if (r === null) return;
        var i = r.tag;
        if (i === 3 || i === 4) {
          var u = r.stateNode.containerInfo;
          if (u === l || (u.nodeType === 8 && u.parentNode === l)) break;
          if (i === 4)
            for (i = r.return; i !== null; ) {
              var a = i.tag;
              if (
                (a === 3 || a === 4) &&
                ((a = i.stateNode.containerInfo),
                a === l || (a.nodeType === 8 && a.parentNode === l))
              )
                return;
              i = i.return;
            }
          for (; u !== null; ) {
            if (((i = nn(u)), i === null)) return;
            if (((a = i.tag), a === 5 || a === 6)) {
              r = o = i;
              continue e;
            }
            u = u.parentNode;
          }
        }
        r = r.return;
      }
    qi(function () {
      var g = o,
        w = Gl(n),
        k = [];
      e: {
        var x = Vu.get(e);
        if (x !== void 0) {
          var T = uo,
            L = e;
          switch (e) {
            case "keypress":
              if (Yr(n) === 0) break e;
            case "keydown":
            case "keyup":
              T = Cc;
              break;
            case "focusin":
              ((L = "focus"), (T = co));
              break;
            case "focusout":
              ((L = "blur"), (T = co));
              break;
            case "beforeblur":
            case "afterblur":
              T = co;
              break;
            case "click":
              if (n.button === 2) break e;
            case "auxclick":
            case "dblclick":
            case "mousedown":
            case "mousemove":
            case "mouseup":
            case "mouseout":
            case "mouseover":
            case "contextmenu":
              T = Su;
              break;
            case "drag":
            case "dragend":
            case "dragenter":
            case "dragexit":
            case "dragleave":
            case "dragover":
            case "dragstart":
            case "drop":
              T = pc;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              T = zc;
              break;
            case Bu:
            case Uu:
            case $u:
              T = gc;
              break;
            case Wu:
              T = Rc;
              break;
            case "scroll":
              T = fc;
              break;
            case "wheel":
              T = Lc;
              break;
            case "copy":
            case "cut":
            case "paste":
              T = vc;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              T = wu;
          }
          var O = (t & 4) !== 0,
            Ee = !O && e === "scroll",
            p = O ? (x !== null ? x + "Capture" : null) : x;
          O = [];
          for (var f = g, h; f !== null; ) {
            h = f;
            var E = h.stateNode;
            if (
              (h.tag === 5 &&
                E !== null &&
                ((h = E),
                p !== null &&
                  ((E = Gn(f, p)), E != null && O.push(dr(f, E, h)))),
              Ee)
            )
              break;
            f = f.return;
          }
          0 < O.length &&
            ((x = new T(x, L, null, n, w)), k.push({ event: x, listeners: O }));
        }
      }
      if ((t & 7) === 0) {
        e: {
          if (
            ((x = e === "mouseover" || e === "pointerover"),
            (T = e === "mouseout" || e === "pointerout"),
            x &&
              n !== Yl &&
              (L = n.relatedTarget || n.fromElement) &&
              (nn(L) || L[jt]))
          )
            break e;
          if (
            (T || x) &&
            ((x =
              w.window === w
                ? w
                : (x = w.ownerDocument)
                  ? x.defaultView || x.parentWindow
                  : window),
            T
              ? ((L = n.relatedTarget || n.toElement),
                (T = g),
                (L = L ? nn(L) : null),
                L !== null &&
                  ((Ee = tn(L)), L !== Ee || (L.tag !== 5 && L.tag !== 6)) &&
                  (L = null))
              : ((T = null), (L = g)),
            T !== L)
          ) {
            if (
              ((O = Su),
              (E = "onMouseLeave"),
              (p = "onMouseEnter"),
              (f = "mouse"),
              (e === "pointerout" || e === "pointerover") &&
                ((O = wu),
                (E = "onPointerLeave"),
                (p = "onPointerEnter"),
                (f = "pointer")),
              (Ee = T == null ? x : zn(T)),
              (h = L == null ? x : zn(L)),
              (x = new O(E, f + "leave", T, n, w)),
              (x.target = Ee),
              (x.relatedTarget = h),
              (E = null),
              nn(w) === g &&
                ((O = new O(p, f + "enter", L, n, w)),
                (O.target = h),
                (O.relatedTarget = Ee),
                (E = O)),
              (Ee = E),
              T && L)
            )
              t: {
                for (O = T, p = L, f = 0, h = O; h; h = jn(h)) f++;
                for (h = 0, E = p; E; E = jn(E)) h++;
                for (; 0 < f - h; ) ((O = jn(O)), f--);
                for (; 0 < h - f; ) ((p = jn(p)), h--);
                for (; f--; ) {
                  if (O === p || (p !== null && O === p.alternate)) break t;
                  ((O = jn(O)), (p = jn(p)));
                }
                O = null;
              }
            else O = null;
            (T !== null && Ku(k, x, T, O, !1),
              L !== null && Ee !== null && Ku(k, Ee, L, O, !0));
          }
        }
        e: {
          if (
            ((x = g ? zn(g) : window),
            (T = x.nodeName && x.nodeName.toLowerCase()),
            T === "select" || (T === "input" && x.type === "file"))
          )
            var D = Bc;
          else if (Pu(x))
            if (Tu) D = Vc;
            else {
              D = $c;
              var U = Uc;
            }
          else
            (T = x.nodeName) &&
              T.toLowerCase() === "input" &&
              (x.type === "checkbox" || x.type === "radio") &&
              (D = Wc);
          if (D && (D = D(e, g))) {
            zu(k, D, n, w);
            break e;
          }
          (U && U(e, x, g),
            e === "focusout" &&
              (U = x._wrapperState) &&
              U.controlled &&
              x.type === "number" &&
              yn(x, "number", x.value));
        }
        switch (((U = g ? zn(g) : window), e)) {
          case "focusin":
            (Pu(U) || U.contentEditable === "true") &&
              ((_n = U), (yo = g), (ar = null));
            break;
          case "focusout":
            ar = yo = _n = null;
            break;
          case "mousedown":
            vo = !0;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            ((vo = !1), Fu(k, n, w));
            break;
          case "selectionchange":
            if (Yc) break;
          case "keydown":
          case "keyup":
            Fu(k, n, w);
        }
        var $;
        if (po)
          e: {
            switch (e) {
              case "compositionstart":
                var H = "onCompositionStart";
                break e;
              case "compositionend":
                H = "onCompositionEnd";
                break e;
              case "compositionupdate":
                H = "onCompositionUpdate";
                break e;
            }
            H = void 0;
          }
        else
          En
            ? Cu(e, n) && (H = "onCompositionEnd")
            : e === "keydown" &&
              n.keyCode === 229 &&
              (H = "onCompositionStart");
        (H &&
          (ku &&
            n.locale !== "ko" &&
            (En || H !== "onCompositionStart"
              ? H === "onCompositionEnd" && En && ($ = yu())
              : ((Bt = w),
                (io = "value" in Bt ? Bt.value : Bt.textContent),
                (En = !0))),
          (U = br(g, H)),
          0 < U.length &&
            ((H = new xu(H, e, null, n, w)),
            k.push({ event: H, listeners: U }),
            $ ? (H.data = $) : (($ = ju(n)), $ !== null && (H.data = $)))),
          ($ = Ic ? Mc(e, n) : Dc(e, n)) &&
            ((g = br(g, "onBeforeInput")),
            0 < g.length &&
              ((w = new xu("onBeforeInput", "beforeinput", null, n, w)),
              k.push({ event: w, listeners: g }),
              (w.data = $))));
      }
      Yu(k, t);
    });
  }
  function dr(e, t, n) {
    return { instance: e, listener: t, currentTarget: n };
  }
  function br(e, t) {
    for (var n = t + "Capture", r = []; e !== null; ) {
      var l = e,
        o = l.stateNode;
      (l.tag === 5 &&
        o !== null &&
        ((l = o),
        (o = Gn(e, n)),
        o != null && r.unshift(dr(e, o, l)),
        (o = Gn(e, t)),
        o != null && r.push(dr(e, o, l))),
        (e = e.return));
    }
    return r;
  }
  function jn(e) {
    if (e === null) return null;
    do e = e.return;
    while (e && e.tag !== 5);
    return e || null;
  }
  function Ku(e, t, n, r, l) {
    for (var o = t._reactName, i = []; n !== null && n !== r; ) {
      var u = n,
        a = u.alternate,
        g = u.stateNode;
      if (a !== null && a === r) break;
      (u.tag === 5 &&
        g !== null &&
        ((u = g),
        l
          ? ((a = Gn(n, o)), a != null && i.unshift(dr(n, a, u)))
          : l || ((a = Gn(n, o)), a != null && i.push(dr(n, a, u)))),
        (n = n.return));
    }
    i.length !== 0 && e.push({ event: t, listeners: i });
  }
  var Jc = /\r\n?/g,
    Zc = /\u0000|\uFFFD/g;
  function Xu(e) {
    return (typeof e == "string" ? e : "" + e)
      .replace(
        Jc,
        `
`,
      )
      .replace(Zc, "");
  }
  function el(e, t, n) {
    if (((t = Xu(t)), Xu(e) !== t && n)) throw Error(d(425));
  }
  function tl() {}
  var _o = null,
    Co = null;
  function jo(e, t) {
    return (
      e === "textarea" ||
      e === "noscript" ||
      typeof t.children == "string" ||
      typeof t.children == "number" ||
      (typeof t.dangerouslySetInnerHTML == "object" &&
        t.dangerouslySetInnerHTML !== null &&
        t.dangerouslySetInnerHTML.__html != null)
    );
  }
  var Po = typeof setTimeout == "function" ? setTimeout : void 0,
    qc = typeof clearTimeout == "function" ? clearTimeout : void 0,
    Ju = typeof Promise == "function" ? Promise : void 0,
    bc =
      typeof queueMicrotask == "function"
        ? queueMicrotask
        : typeof Ju < "u"
          ? function (e) {
              return Ju.resolve(null).then(e).catch(ef);
            }
          : Po;
  function ef(e) {
    setTimeout(function () {
      throw e;
    });
  }
  function zo(e, t) {
    var n = t,
      r = 0;
    do {
      var l = n.nextSibling;
      if ((e.removeChild(n), l && l.nodeType === 8))
        if (((n = l.data), n === "/$")) {
          if (r === 0) {
            (e.removeChild(l), nr(t));
            return;
          }
          r--;
        } else (n !== "$" && n !== "$?" && n !== "$!") || r++;
      n = l;
    } while (n);
    nr(t);
  }
  function $t(e) {
    for (; e != null; e = e.nextSibling) {
      var t = e.nodeType;
      if (t === 1 || t === 3) break;
      if (t === 8) {
        if (((t = e.data), t === "$" || t === "$!" || t === "$?")) break;
        if (t === "/$") return null;
      }
    }
    return e;
  }
  function Zu(e) {
    e = e.previousSibling;
    for (var t = 0; e; ) {
      if (e.nodeType === 8) {
        var n = e.data;
        if (n === "$" || n === "$!" || n === "$?") {
          if (t === 0) return e;
          t--;
        } else n === "/$" && t++;
      }
      e = e.previousSibling;
    }
    return null;
  }
  var Pn = Math.random().toString(36).slice(2),
    St = "__reactFiber$" + Pn,
    pr = "__reactProps$" + Pn,
    jt = "__reactContainer$" + Pn,
    To = "__reactEvents$" + Pn,
    tf = "__reactListeners$" + Pn,
    nf = "__reactHandles$" + Pn;
  function nn(e) {
    var t = e[St];
    if (t) return t;
    for (var n = e.parentNode; n; ) {
      if ((t = n[jt] || n[St])) {
        if (
          ((n = t.alternate),
          t.child !== null || (n !== null && n.child !== null))
        )
          for (e = Zu(e); e !== null; ) {
            if ((n = e[St])) return n;
            e = Zu(e);
          }
        return t;
      }
      ((e = n), (n = e.parentNode));
    }
    return null;
  }
  function hr(e) {
    return (
      (e = e[St] || e[jt]),
      !e || (e.tag !== 5 && e.tag !== 6 && e.tag !== 13 && e.tag !== 3)
        ? null
        : e
    );
  }
  function zn(e) {
    if (e.tag === 5 || e.tag === 6) return e.stateNode;
    throw Error(d(33));
  }
  function nl(e) {
    return e[pr] || null;
  }
  var Ro = [],
    Tn = -1;
  function Wt(e) {
    return { current: e };
  }
  function he(e) {
    0 > Tn || ((e.current = Ro[Tn]), (Ro[Tn] = null), Tn--);
  }
  function fe(e, t) {
    (Tn++, (Ro[Tn] = e.current), (e.current = t));
  }
  var Vt = {},
    Ae = Wt(Vt),
    Ye = Wt(!1),
    rn = Vt;
  function Rn(e, t) {
    var n = e.type.contextTypes;
    if (!n) return Vt;
    var r = e.stateNode;
    if (r && r.__reactInternalMemoizedUnmaskedChildContext === t)
      return r.__reactInternalMemoizedMaskedChildContext;
    var l = {},
      o;
    for (o in n) l[o] = t[o];
    return (
      r &&
        ((e = e.stateNode),
        (e.__reactInternalMemoizedUnmaskedChildContext = t),
        (e.__reactInternalMemoizedMaskedChildContext = l)),
      l
    );
  }
  function Ge(e) {
    return ((e = e.childContextTypes), e != null);
  }
  function rl() {
    (he(Ye), he(Ae));
  }
  function qu(e, t, n) {
    if (Ae.current !== Vt) throw Error(d(168));
    (fe(Ae, t), fe(Ye, n));
  }
  function bu(e, t, n) {
    var r = e.stateNode;
    if (((t = t.childContextTypes), typeof r.getChildContext != "function"))
      return n;
    r = r.getChildContext();
    for (var l in r) if (!(l in t)) throw Error(d(108, le(e) || "Unknown", l));
    return m({}, n, r);
  }
  function ll(e) {
    return (
      (e =
        ((e = e.stateNode) && e.__reactInternalMemoizedMergedChildContext) ||
        Vt),
      (rn = Ae.current),
      fe(Ae, e),
      fe(Ye, Ye.current),
      !0
    );
  }
  function es(e, t, n) {
    var r = e.stateNode;
    if (!r) throw Error(d(169));
    (n
      ? ((e = bu(e, t, rn)),
        (r.__reactInternalMemoizedMergedChildContext = e),
        he(Ye),
        he(Ae),
        fe(Ae, e))
      : he(Ye),
      fe(Ye, n));
  }
  var Pt = null,
    ol = !1,
    No = !1;
  function ts(e) {
    Pt === null ? (Pt = [e]) : Pt.push(e);
  }
  function rf(e) {
    ((ol = !0), ts(e));
  }
  function Ht() {
    if (!No && Pt !== null) {
      No = !0;
      var e = 0,
        t = ue;
      try {
        var n = Pt;
        for (ue = 1; e < n.length; e++) {
          var r = n[e];
          do r = r(!0);
          while (r !== null);
        }
        ((Pt = null), (ol = !1));
      } catch (l) {
        throw (Pt !== null && (Pt = Pt.slice(e + 1)), ru(ql, Ht), l);
      } finally {
        ((ue = t), (No = !1));
      }
    }
    return null;
  }
  var Nn = [],
    Ln = 0,
    il = null,
    ul = 0,
    rt = [],
    lt = 0,
    ln = null,
    zt = 1,
    Tt = "";
  function on(e, t) {
    ((Nn[Ln++] = ul), (Nn[Ln++] = il), (il = e), (ul = t));
  }
  function ns(e, t, n) {
    ((rt[lt++] = zt), (rt[lt++] = Tt), (rt[lt++] = ln), (ln = e));
    var r = zt;
    e = Tt;
    var l = 32 - ft(r) - 1;
    ((r &= ~(1 << l)), (n += 1));
    var o = 32 - ft(t) + l;
    if (30 < o) {
      var i = l - (l % 5);
      ((o = (r & ((1 << i) - 1)).toString(32)),
        (r >>= i),
        (l -= i),
        (zt = (1 << (32 - ft(t) + l)) | (n << l) | r),
        (Tt = o + e));
    } else ((zt = (1 << o) | (n << l) | r), (Tt = e));
  }
  function Lo(e) {
    e.return !== null && (on(e, 1), ns(e, 1, 0));
  }
  function Oo(e) {
    for (; e === il; )
      ((il = Nn[--Ln]), (Nn[Ln] = null), (ul = Nn[--Ln]), (Nn[Ln] = null));
    for (; e === ln; )
      ((ln = rt[--lt]),
        (rt[lt] = null),
        (Tt = rt[--lt]),
        (rt[lt] = null),
        (zt = rt[--lt]),
        (rt[lt] = null));
  }
  var et = null,
    tt = null,
    me = !1,
    pt = null;
  function rs(e, t) {
    var n = st(5, null, null, 0);
    ((n.elementType = "DELETED"),
      (n.stateNode = t),
      (n.return = e),
      (t = e.deletions),
      t === null ? ((e.deletions = [n]), (e.flags |= 16)) : t.push(n));
  }
  function ls(e, t) {
    switch (e.tag) {
      case 5:
        var n = e.type;
        return (
          (t =
            t.nodeType !== 1 || n.toLowerCase() !== t.nodeName.toLowerCase()
              ? null
              : t),
          t !== null
            ? ((e.stateNode = t), (et = e), (tt = $t(t.firstChild)), !0)
            : !1
        );
      case 6:
        return (
          (t = e.pendingProps === "" || t.nodeType !== 3 ? null : t),
          t !== null ? ((e.stateNode = t), (et = e), (tt = null), !0) : !1
        );
      case 13:
        return (
          (t = t.nodeType !== 8 ? null : t),
          t !== null
            ? ((n = ln !== null ? { id: zt, overflow: Tt } : null),
              (e.memoizedState = {
                dehydrated: t,
                treeContext: n,
                retryLane: 1073741824,
              }),
              (n = st(18, null, null, 0)),
              (n.stateNode = t),
              (n.return = e),
              (e.child = n),
              (et = e),
              (tt = null),
              !0)
            : !1
        );
      default:
        return !1;
    }
  }
  function Io(e) {
    return (e.mode & 1) !== 0 && (e.flags & 128) === 0;
  }
  function Mo(e) {
    if (me) {
      var t = tt;
      if (t) {
        var n = t;
        if (!ls(e, t)) {
          if (Io(e)) throw Error(d(418));
          t = $t(n.nextSibling);
          var r = et;
          t && ls(e, t)
            ? rs(r, n)
            : ((e.flags = (e.flags & -4097) | 2), (me = !1), (et = e));
        }
      } else {
        if (Io(e)) throw Error(d(418));
        ((e.flags = (e.flags & -4097) | 2), (me = !1), (et = e));
      }
    }
  }
  function os(e) {
    for (
      e = e.return;
      e !== null && e.tag !== 5 && e.tag !== 3 && e.tag !== 13;
    )
      e = e.return;
    et = e;
  }
  function sl(e) {
    if (e !== et) return !1;
    if (!me) return (os(e), (me = !0), !1);
    var t;
    if (
      ((t = e.tag !== 3) &&
        !(t = e.tag !== 5) &&
        ((t = e.type),
        (t = t !== "head" && t !== "body" && !jo(e.type, e.memoizedProps))),
      t && (t = tt))
    ) {
      if (Io(e)) throw (is(), Error(d(418)));
      for (; t; ) (rs(e, t), (t = $t(t.nextSibling)));
    }
    if ((os(e), e.tag === 13)) {
      if (((e = e.memoizedState), (e = e !== null ? e.dehydrated : null), !e))
        throw Error(d(317));
      e: {
        for (e = e.nextSibling, t = 0; e; ) {
          if (e.nodeType === 8) {
            var n = e.data;
            if (n === "/$") {
              if (t === 0) {
                tt = $t(e.nextSibling);
                break e;
              }
              t--;
            } else (n !== "$" && n !== "$!" && n !== "$?") || t++;
          }
          e = e.nextSibling;
        }
        tt = null;
      }
    } else tt = et ? $t(e.stateNode.nextSibling) : null;
    return !0;
  }
  function is() {
    for (var e = tt; e; ) e = $t(e.nextSibling);
  }
  function On() {
    ((tt = et = null), (me = !1));
  }
  function Do(e) {
    pt === null ? (pt = [e]) : pt.push(e);
  }
  var lf = se.ReactCurrentBatchConfig;
  function mr(e, t, n) {
    if (
      ((e = n.ref),
      e !== null && typeof e != "function" && typeof e != "object")
    ) {
      if (n._owner) {
        if (((n = n._owner), n)) {
          if (n.tag !== 1) throw Error(d(309));
          var r = n.stateNode;
        }
        if (!r) throw Error(d(147, e));
        var l = r,
          o = "" + e;
        return t !== null &&
          t.ref !== null &&
          typeof t.ref == "function" &&
          t.ref._stringRef === o
          ? t.ref
          : ((t = function (i) {
              var u = l.refs;
              i === null ? delete u[o] : (u[o] = i);
            }),
            (t._stringRef = o),
            t);
      }
      if (typeof e != "string") throw Error(d(284));
      if (!n._owner) throw Error(d(290, e));
    }
    return e;
  }
  function al(e, t) {
    throw (
      (e = Object.prototype.toString.call(t)),
      Error(
        d(
          31,
          e === "[object Object]"
            ? "object with keys {" + Object.keys(t).join(", ") + "}"
            : e,
        ),
      )
    );
  }
  function us(e) {
    var t = e._init;
    return t(e._payload);
  }
  function ss(e) {
    function t(p, f) {
      if (e) {
        var h = p.deletions;
        h === null ? ((p.deletions = [f]), (p.flags |= 16)) : h.push(f);
      }
    }
    function n(p, f) {
      if (!e) return null;
      for (; f !== null; ) (t(p, f), (f = f.sibling));
      return null;
    }
    function r(p, f) {
      for (p = new Map(); f !== null; )
        (f.key !== null ? p.set(f.key, f) : p.set(f.index, f), (f = f.sibling));
      return p;
    }
    function l(p, f) {
      return ((p = qt(p, f)), (p.index = 0), (p.sibling = null), p);
    }
    function o(p, f, h) {
      return (
        (p.index = h),
        e
          ? ((h = p.alternate),
            h !== null
              ? ((h = h.index), h < f ? ((p.flags |= 2), f) : h)
              : ((p.flags |= 2), f))
          : ((p.flags |= 1048576), f)
      );
    }
    function i(p) {
      return (e && p.alternate === null && (p.flags |= 2), p);
    }
    function u(p, f, h, E) {
      return f === null || f.tag !== 6
        ? ((f = Pi(h, p.mode, E)), (f.return = p), f)
        : ((f = l(f, h)), (f.return = p), f);
    }
    function a(p, f, h, E) {
      var D = h.type;
      return D === ce
        ? w(p, f, h.props.children, E, h.key)
        : f !== null &&
            (f.elementType === D ||
              (typeof D == "object" &&
                D !== null &&
                D.$$typeof === de &&
                us(D) === f.type))
          ? ((E = l(f, h.props)), (E.ref = mr(p, f, h)), (E.return = p), E)
          : ((E = Ol(h.type, h.key, h.props, null, p.mode, E)),
            (E.ref = mr(p, f, h)),
            (E.return = p),
            E);
    }
    function g(p, f, h, E) {
      return f === null ||
        f.tag !== 4 ||
        f.stateNode.containerInfo !== h.containerInfo ||
        f.stateNode.implementation !== h.implementation
        ? ((f = zi(h, p.mode, E)), (f.return = p), f)
        : ((f = l(f, h.children || [])), (f.return = p), f);
    }
    function w(p, f, h, E, D) {
      return f === null || f.tag !== 7
        ? ((f = hn(h, p.mode, E, D)), (f.return = p), f)
        : ((f = l(f, h)), (f.return = p), f);
    }
    function k(p, f, h) {
      if ((typeof f == "string" && f !== "") || typeof f == "number")
        return ((f = Pi("" + f, p.mode, h)), (f.return = p), f);
      if (typeof f == "object" && f !== null) {
        switch (f.$$typeof) {
          case _e:
            return (
              (h = Ol(f.type, f.key, f.props, null, p.mode, h)),
              (h.ref = mr(p, null, f)),
              (h.return = p),
              h
            );
          case Z:
            return ((f = zi(f, p.mode, h)), (f.return = p), f);
          case de:
            var E = f._init;
            return k(p, E(f._payload), h);
        }
        if (It(f) || F(f))
          return ((f = hn(f, p.mode, h, null)), (f.return = p), f);
        al(p, f);
      }
      return null;
    }
    function x(p, f, h, E) {
      var D = f !== null ? f.key : null;
      if ((typeof h == "string" && h !== "") || typeof h == "number")
        return D !== null ? null : u(p, f, "" + h, E);
      if (typeof h == "object" && h !== null) {
        switch (h.$$typeof) {
          case _e:
            return h.key === D ? a(p, f, h, E) : null;
          case Z:
            return h.key === D ? g(p, f, h, E) : null;
          case de:
            return ((D = h._init), x(p, f, D(h._payload), E));
        }
        if (It(h) || F(h)) return D !== null ? null : w(p, f, h, E, null);
        al(p, h);
      }
      return null;
    }
    function T(p, f, h, E, D) {
      if ((typeof E == "string" && E !== "") || typeof E == "number")
        return ((p = p.get(h) || null), u(f, p, "" + E, D));
      if (typeof E == "object" && E !== null) {
        switch (E.$$typeof) {
          case _e:
            return (
              (p = p.get(E.key === null ? h : E.key) || null),
              a(f, p, E, D)
            );
          case Z:
            return (
              (p = p.get(E.key === null ? h : E.key) || null),
              g(f, p, E, D)
            );
          case de:
            var U = E._init;
            return T(p, f, h, U(E._payload), D);
        }
        if (It(E) || F(E)) return ((p = p.get(h) || null), w(f, p, E, D, null));
        al(f, E);
      }
      return null;
    }
    function L(p, f, h, E) {
      for (
        var D = null, U = null, $ = f, H = (f = 0), Le = null;
        $ !== null && H < h.length;
        H++
      ) {
        $.index > H ? ((Le = $), ($ = null)) : (Le = $.sibling);
        var oe = x(p, $, h[H], E);
        if (oe === null) {
          $ === null && ($ = Le);
          break;
        }
        (e && $ && oe.alternate === null && t(p, $),
          (f = o(oe, f, H)),
          U === null ? (D = oe) : (U.sibling = oe),
          (U = oe),
          ($ = Le));
      }
      if (H === h.length) return (n(p, $), me && on(p, H), D);
      if ($ === null) {
        for (; H < h.length; H++)
          (($ = k(p, h[H], E)),
            $ !== null &&
              ((f = o($, f, H)),
              U === null ? (D = $) : (U.sibling = $),
              (U = $)));
        return (me && on(p, H), D);
      }
      for ($ = r(p, $); H < h.length; H++)
        ((Le = T($, p, H, h[H], E)),
          Le !== null &&
            (e &&
              Le.alternate !== null &&
              $.delete(Le.key === null ? H : Le.key),
            (f = o(Le, f, H)),
            U === null ? (D = Le) : (U.sibling = Le),
            (U = Le)));
      return (
        e &&
          $.forEach(function (bt) {
            return t(p, bt);
          }),
        me && on(p, H),
        D
      );
    }
    function O(p, f, h, E) {
      var D = F(h);
      if (typeof D != "function") throw Error(d(150));
      if (((h = D.call(h)), h == null)) throw Error(d(151));
      for (
        var U = (D = null), $ = f, H = (f = 0), Le = null, oe = h.next();
        $ !== null && !oe.done;
        H++, oe = h.next()
      ) {
        $.index > H ? ((Le = $), ($ = null)) : (Le = $.sibling);
        var bt = x(p, $, oe.value, E);
        if (bt === null) {
          $ === null && ($ = Le);
          break;
        }
        (e && $ && bt.alternate === null && t(p, $),
          (f = o(bt, f, H)),
          U === null ? (D = bt) : (U.sibling = bt),
          (U = bt),
          ($ = Le));
      }
      if (oe.done) return (n(p, $), me && on(p, H), D);
      if ($ === null) {
        for (; !oe.done; H++, oe = h.next())
          ((oe = k(p, oe.value, E)),
            oe !== null &&
              ((f = o(oe, f, H)),
              U === null ? (D = oe) : (U.sibling = oe),
              (U = oe)));
        return (me && on(p, H), D);
      }
      for ($ = r(p, $); !oe.done; H++, oe = h.next())
        ((oe = T($, p, H, oe.value, E)),
          oe !== null &&
            (e &&
              oe.alternate !== null &&
              $.delete(oe.key === null ? H : oe.key),
            (f = o(oe, f, H)),
            U === null ? (D = oe) : (U.sibling = oe),
            (U = oe)));
      return (
        e &&
          $.forEach(function (Af) {
            return t(p, Af);
          }),
        me && on(p, H),
        D
      );
    }
    function Ee(p, f, h, E) {
      if (
        (typeof h == "object" &&
          h !== null &&
          h.type === ce &&
          h.key === null &&
          (h = h.props.children),
        typeof h == "object" && h !== null)
      ) {
        switch (h.$$typeof) {
          case _e:
            e: {
              for (var D = h.key, U = f; U !== null; ) {
                if (U.key === D) {
                  if (((D = h.type), D === ce)) {
                    if (U.tag === 7) {
                      (n(p, U.sibling),
                        (f = l(U, h.props.children)),
                        (f.return = p),
                        (p = f));
                      break e;
                    }
                  } else if (
                    U.elementType === D ||
                    (typeof D == "object" &&
                      D !== null &&
                      D.$$typeof === de &&
                      us(D) === U.type)
                  ) {
                    (n(p, U.sibling),
                      (f = l(U, h.props)),
                      (f.ref = mr(p, U, h)),
                      (f.return = p),
                      (p = f));
                    break e;
                  }
                  n(p, U);
                  break;
                } else t(p, U);
                U = U.sibling;
              }
              h.type === ce
                ? ((f = hn(h.props.children, p.mode, E, h.key)),
                  (f.return = p),
                  (p = f))
                : ((E = Ol(h.type, h.key, h.props, null, p.mode, E)),
                  (E.ref = mr(p, f, h)),
                  (E.return = p),
                  (p = E));
            }
            return i(p);
          case Z:
            e: {
              for (U = h.key; f !== null; ) {
                if (f.key === U)
                  if (
                    f.tag === 4 &&
                    f.stateNode.containerInfo === h.containerInfo &&
                    f.stateNode.implementation === h.implementation
                  ) {
                    (n(p, f.sibling),
                      (f = l(f, h.children || [])),
                      (f.return = p),
                      (p = f));
                    break e;
                  } else {
                    n(p, f);
                    break;
                  }
                else t(p, f);
                f = f.sibling;
              }
              ((f = zi(h, p.mode, E)), (f.return = p), (p = f));
            }
            return i(p);
          case de:
            return ((U = h._init), Ee(p, f, U(h._payload), E));
        }
        if (It(h)) return L(p, f, h, E);
        if (F(h)) return O(p, f, h, E);
        al(p, h);
      }
      return (typeof h == "string" && h !== "") || typeof h == "number"
        ? ((h = "" + h),
          f !== null && f.tag === 6
            ? (n(p, f.sibling), (f = l(f, h)), (f.return = p), (p = f))
            : (n(p, f), (f = Pi(h, p.mode, E)), (f.return = p), (p = f)),
          i(p))
        : n(p, f);
    }
    return Ee;
  }
  var In = ss(!0),
    as = ss(!1),
    cl = Wt(null),
    fl = null,
    Mn = null,
    Fo = null;
  function Ao() {
    Fo = Mn = fl = null;
  }
  function Bo(e) {
    var t = cl.current;
    (he(cl), (e._currentValue = t));
  }
  function Uo(e, t, n) {
    for (; e !== null; ) {
      var r = e.alternate;
      if (
        ((e.childLanes & t) !== t
          ? ((e.childLanes |= t), r !== null && (r.childLanes |= t))
          : r !== null && (r.childLanes & t) !== t && (r.childLanes |= t),
        e === n)
      )
        break;
      e = e.return;
    }
  }
  function Dn(e, t) {
    ((fl = e),
      (Fo = Mn = null),
      (e = e.dependencies),
      e !== null &&
        e.firstContext !== null &&
        ((e.lanes & t) !== 0 && (Ke = !0), (e.firstContext = null)));
  }
  function ot(e) {
    var t = e._currentValue;
    if (Fo !== e)
      if (((e = { context: e, memoizedValue: t, next: null }), Mn === null)) {
        if (fl === null) throw Error(d(308));
        ((Mn = e), (fl.dependencies = { lanes: 0, firstContext: e }));
      } else Mn = Mn.next = e;
    return t;
  }
  var un = null;
  function $o(e) {
    un === null ? (un = [e]) : un.push(e);
  }
  function cs(e, t, n, r) {
    var l = t.interleaved;
    return (
      l === null ? ((n.next = n), $o(t)) : ((n.next = l.next), (l.next = n)),
      (t.interleaved = n),
      Rt(e, r)
    );
  }
  function Rt(e, t) {
    e.lanes |= t;
    var n = e.alternate;
    for (n !== null && (n.lanes |= t), n = e, e = e.return; e !== null; )
      ((e.childLanes |= t),
        (n = e.alternate),
        n !== null && (n.childLanes |= t),
        (n = e),
        (e = e.return));
    return n.tag === 3 ? n.stateNode : null;
  }
  var Qt = !1;
  function Wo(e) {
    e.updateQueue = {
      baseState: e.memoizedState,
      firstBaseUpdate: null,
      lastBaseUpdate: null,
      shared: { pending: null, interleaved: null, lanes: 0 },
      effects: null,
    };
  }
  function fs(e, t) {
    ((e = e.updateQueue),
      t.updateQueue === e &&
        (t.updateQueue = {
          baseState: e.baseState,
          firstBaseUpdate: e.firstBaseUpdate,
          lastBaseUpdate: e.lastBaseUpdate,
          shared: e.shared,
          effects: e.effects,
        }));
  }
  function Nt(e, t) {
    return {
      eventTime: e,
      lane: t,
      tag: 0,
      payload: null,
      callback: null,
      next: null,
    };
  }
  function Yt(e, t, n) {
    var r = e.updateQueue;
    if (r === null) return null;
    if (((r = r.shared), (re & 2) !== 0)) {
      var l = r.pending;
      return (
        l === null ? (t.next = t) : ((t.next = l.next), (l.next = t)),
        (r.pending = t),
        Rt(e, n)
      );
    }
    return (
      (l = r.interleaved),
      l === null ? ((t.next = t), $o(r)) : ((t.next = l.next), (l.next = t)),
      (r.interleaved = t),
      Rt(e, n)
    );
  }
  function dl(e, t, n) {
    if (
      ((t = t.updateQueue), t !== null && ((t = t.shared), (n & 4194240) !== 0))
    ) {
      var r = t.lanes;
      ((r &= e.pendingLanes), (n |= r), (t.lanes = n), to(e, n));
    }
  }
  function ds(e, t) {
    var n = e.updateQueue,
      r = e.alternate;
    if (r !== null && ((r = r.updateQueue), n === r)) {
      var l = null,
        o = null;
      if (((n = n.firstBaseUpdate), n !== null)) {
        do {
          var i = {
            eventTime: n.eventTime,
            lane: n.lane,
            tag: n.tag,
            payload: n.payload,
            callback: n.callback,
            next: null,
          };
          (o === null ? (l = o = i) : (o = o.next = i), (n = n.next));
        } while (n !== null);
        o === null ? (l = o = t) : (o = o.next = t);
      } else l = o = t;
      ((n = {
        baseState: r.baseState,
        firstBaseUpdate: l,
        lastBaseUpdate: o,
        shared: r.shared,
        effects: r.effects,
      }),
        (e.updateQueue = n));
      return;
    }
    ((e = n.lastBaseUpdate),
      e === null ? (n.firstBaseUpdate = t) : (e.next = t),
      (n.lastBaseUpdate = t));
  }
  function pl(e, t, n, r) {
    var l = e.updateQueue;
    Qt = !1;
    var o = l.firstBaseUpdate,
      i = l.lastBaseUpdate,
      u = l.shared.pending;
    if (u !== null) {
      l.shared.pending = null;
      var a = u,
        g = a.next;
      ((a.next = null), i === null ? (o = g) : (i.next = g), (i = a));
      var w = e.alternate;
      w !== null &&
        ((w = w.updateQueue),
        (u = w.lastBaseUpdate),
        u !== i &&
          (u === null ? (w.firstBaseUpdate = g) : (u.next = g),
          (w.lastBaseUpdate = a)));
    }
    if (o !== null) {
      var k = l.baseState;
      ((i = 0), (w = g = a = null), (u = o));
      do {
        var x = u.lane,
          T = u.eventTime;
        if ((r & x) === x) {
          w !== null &&
            (w = w.next =
              {
                eventTime: T,
                lane: 0,
                tag: u.tag,
                payload: u.payload,
                callback: u.callback,
                next: null,
              });
          e: {
            var L = e,
              O = u;
            switch (((x = t), (T = n), O.tag)) {
              case 1:
                if (((L = O.payload), typeof L == "function")) {
                  k = L.call(T, k, x);
                  break e;
                }
                k = L;
                break e;
              case 3:
                L.flags = (L.flags & -65537) | 128;
              case 0:
                if (
                  ((L = O.payload),
                  (x = typeof L == "function" ? L.call(T, k, x) : L),
                  x == null)
                )
                  break e;
                k = m({}, k, x);
                break e;
              case 2:
                Qt = !0;
            }
          }
          u.callback !== null &&
            u.lane !== 0 &&
            ((e.flags |= 64),
            (x = l.effects),
            x === null ? (l.effects = [u]) : x.push(u));
        } else
          ((T = {
            eventTime: T,
            lane: x,
            tag: u.tag,
            payload: u.payload,
            callback: u.callback,
            next: null,
          }),
            w === null ? ((g = w = T), (a = k)) : (w = w.next = T),
            (i |= x));
        if (((u = u.next), u === null)) {
          if (((u = l.shared.pending), u === null)) break;
          ((x = u),
            (u = x.next),
            (x.next = null),
            (l.lastBaseUpdate = x),
            (l.shared.pending = null));
        }
      } while (!0);
      if (
        (w === null && (a = k),
        (l.baseState = a),
        (l.firstBaseUpdate = g),
        (l.lastBaseUpdate = w),
        (t = l.shared.interleaved),
        t !== null)
      ) {
        l = t;
        do ((i |= l.lane), (l = l.next));
        while (l !== t);
      } else o === null && (l.shared.lanes = 0);
      ((cn |= i), (e.lanes = i), (e.memoizedState = k));
    }
  }
  function ps(e, t, n) {
    if (((e = t.effects), (t.effects = null), e !== null))
      for (t = 0; t < e.length; t++) {
        var r = e[t],
          l = r.callback;
        if (l !== null) {
          if (((r.callback = null), (r = n), typeof l != "function"))
            throw Error(d(191, l));
          l.call(r);
        }
      }
  }
  var gr = {},
    xt = Wt(gr),
    yr = Wt(gr),
    vr = Wt(gr);
  function sn(e) {
    if (e === gr) throw Error(d(174));
    return e;
  }
  function Vo(e, t) {
    switch ((fe(vr, t), fe(yr, e), fe(xt, gr), (e = t.nodeType), e)) {
      case 9:
      case 11:
        t = (t = t.documentElement) ? t.namespaceURI : Vl(null, "");
        break;
      default:
        ((e = e === 8 ? t.parentNode : t),
          (t = e.namespaceURI || null),
          (e = e.tagName),
          (t = Vl(t, e)));
    }
    (he(xt), fe(xt, t));
  }
  function Fn() {
    (he(xt), he(yr), he(vr));
  }
  function hs(e) {
    sn(vr.current);
    var t = sn(xt.current),
      n = Vl(t, e.type);
    t !== n && (fe(yr, e), fe(xt, n));
  }
  function Ho(e) {
    yr.current === e && (he(xt), he(yr));
  }
  var ge = Wt(0);
  function hl(e) {
    for (var t = e; t !== null; ) {
      if (t.tag === 13) {
        var n = t.memoizedState;
        if (
          n !== null &&
          ((n = n.dehydrated), n === null || n.data === "$?" || n.data === "$!")
        )
          return t;
      } else if (t.tag === 19 && t.memoizedProps.revealOrder !== void 0) {
        if ((t.flags & 128) !== 0) return t;
      } else if (t.child !== null) {
        ((t.child.return = t), (t = t.child));
        continue;
      }
      if (t === e) break;
      for (; t.sibling === null; ) {
        if (t.return === null || t.return === e) return null;
        t = t.return;
      }
      ((t.sibling.return = t.return), (t = t.sibling));
    }
    return null;
  }
  var Qo = [];
  function Yo() {
    for (var e = 0; e < Qo.length; e++)
      Qo[e]._workInProgressVersionPrimary = null;
    Qo.length = 0;
  }
  var ml = se.ReactCurrentDispatcher,
    Go = se.ReactCurrentBatchConfig,
    an = 0,
    ye = null,
    je = null,
    Re = null,
    gl = !1,
    Sr = !1,
    xr = 0,
    of = 0;
  function Be() {
    throw Error(d(321));
  }
  function Ko(e, t) {
    if (t === null) return !1;
    for (var n = 0; n < t.length && n < e.length; n++)
      if (!dt(e[n], t[n])) return !1;
    return !0;
  }
  function Xo(e, t, n, r, l, o) {
    if (
      ((an = o),
      (ye = t),
      (t.memoizedState = null),
      (t.updateQueue = null),
      (t.lanes = 0),
      (ml.current = e === null || e.memoizedState === null ? cf : ff),
      (e = n(r, l)),
      Sr)
    ) {
      o = 0;
      do {
        if (((Sr = !1), (xr = 0), 25 <= o)) throw Error(d(301));
        ((o += 1),
          (Re = je = null),
          (t.updateQueue = null),
          (ml.current = df),
          (e = n(r, l)));
      } while (Sr);
    }
    if (
      ((ml.current = Sl),
      (t = je !== null && je.next !== null),
      (an = 0),
      (Re = je = ye = null),
      (gl = !1),
      t)
    )
      throw Error(d(300));
    return e;
  }
  function Jo() {
    var e = xr !== 0;
    return ((xr = 0), e);
  }
  function wt() {
    var e = {
      memoizedState: null,
      baseState: null,
      baseQueue: null,
      queue: null,
      next: null,
    };
    return (Re === null ? (ye.memoizedState = Re = e) : (Re = Re.next = e), Re);
  }
  function it() {
    if (je === null) {
      var e = ye.alternate;
      e = e !== null ? e.memoizedState : null;
    } else e = je.next;
    var t = Re === null ? ye.memoizedState : Re.next;
    if (t !== null) ((Re = t), (je = e));
    else {
      if (e === null) throw Error(d(310));
      ((je = e),
        (e = {
          memoizedState: je.memoizedState,
          baseState: je.baseState,
          baseQueue: je.baseQueue,
          queue: je.queue,
          next: null,
        }),
        Re === null ? (ye.memoizedState = Re = e) : (Re = Re.next = e));
    }
    return Re;
  }
  function wr(e, t) {
    return typeof t == "function" ? t(e) : t;
  }
  function Zo(e) {
    var t = it(),
      n = t.queue;
    if (n === null) throw Error(d(311));
    n.lastRenderedReducer = e;
    var r = je,
      l = r.baseQueue,
      o = n.pending;
    if (o !== null) {
      if (l !== null) {
        var i = l.next;
        ((l.next = o.next), (o.next = i));
      }
      ((r.baseQueue = l = o), (n.pending = null));
    }
    if (l !== null) {
      ((o = l.next), (r = r.baseState));
      var u = (i = null),
        a = null,
        g = o;
      do {
        var w = g.lane;
        if ((an & w) === w)
          (a !== null &&
            (a = a.next =
              {
                lane: 0,
                action: g.action,
                hasEagerState: g.hasEagerState,
                eagerState: g.eagerState,
                next: null,
              }),
            (r = g.hasEagerState ? g.eagerState : e(r, g.action)));
        else {
          var k = {
            lane: w,
            action: g.action,
            hasEagerState: g.hasEagerState,
            eagerState: g.eagerState,
            next: null,
          };
          (a === null ? ((u = a = k), (i = r)) : (a = a.next = k),
            (ye.lanes |= w),
            (cn |= w));
        }
        g = g.next;
      } while (g !== null && g !== o);
      (a === null ? (i = r) : (a.next = u),
        dt(r, t.memoizedState) || (Ke = !0),
        (t.memoizedState = r),
        (t.baseState = i),
        (t.baseQueue = a),
        (n.lastRenderedState = r));
    }
    if (((e = n.interleaved), e !== null)) {
      l = e;
      do ((o = l.lane), (ye.lanes |= o), (cn |= o), (l = l.next));
      while (l !== e);
    } else l === null && (n.lanes = 0);
    return [t.memoizedState, n.dispatch];
  }
  function qo(e) {
    var t = it(),
      n = t.queue;
    if (n === null) throw Error(d(311));
    n.lastRenderedReducer = e;
    var r = n.dispatch,
      l = n.pending,
      o = t.memoizedState;
    if (l !== null) {
      n.pending = null;
      var i = (l = l.next);
      do ((o = e(o, i.action)), (i = i.next));
      while (i !== l);
      (dt(o, t.memoizedState) || (Ke = !0),
        (t.memoizedState = o),
        t.baseQueue === null && (t.baseState = o),
        (n.lastRenderedState = o));
    }
    return [o, r];
  }
  function ms() {}
  function gs(e, t) {
    var n = ye,
      r = it(),
      l = t(),
      o = !dt(r.memoizedState, l);
    if (
      (o && ((r.memoizedState = l), (Ke = !0)),
      (r = r.queue),
      bo(Ss.bind(null, n, r, e), [e]),
      r.getSnapshot !== t || o || (Re !== null && Re.memoizedState.tag & 1))
    ) {
      if (
        ((n.flags |= 2048),
        kr(9, vs.bind(null, n, r, l, t), void 0, null),
        Ne === null)
      )
        throw Error(d(349));
      (an & 30) !== 0 || ys(n, t, l);
    }
    return l;
  }
  function ys(e, t, n) {
    ((e.flags |= 16384),
      (e = { getSnapshot: t, value: n }),
      (t = ye.updateQueue),
      t === null
        ? ((t = { lastEffect: null, stores: null }),
          (ye.updateQueue = t),
          (t.stores = [e]))
        : ((n = t.stores), n === null ? (t.stores = [e]) : n.push(e)));
  }
  function vs(e, t, n, r) {
    ((t.value = n), (t.getSnapshot = r), xs(t) && ws(e));
  }
  function Ss(e, t, n) {
    return n(function () {
      xs(t) && ws(e);
    });
  }
  function xs(e) {
    var t = e.getSnapshot;
    e = e.value;
    try {
      var n = t();
      return !dt(e, n);
    } catch {
      return !0;
    }
  }
  function ws(e) {
    var t = Rt(e, 1);
    t !== null && yt(t, e, 1, -1);
  }
  function ks(e) {
    var t = wt();
    return (
      typeof e == "function" && (e = e()),
      (t.memoizedState = t.baseState = e),
      (e = {
        pending: null,
        interleaved: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: wr,
        lastRenderedState: e,
      }),
      (t.queue = e),
      (e = e.dispatch = af.bind(null, ye, e)),
      [t.memoizedState, e]
    );
  }
  function kr(e, t, n, r) {
    return (
      (e = { tag: e, create: t, destroy: n, deps: r, next: null }),
      (t = ye.updateQueue),
      t === null
        ? ((t = { lastEffect: null, stores: null }),
          (ye.updateQueue = t),
          (t.lastEffect = e.next = e))
        : ((n = t.lastEffect),
          n === null
            ? (t.lastEffect = e.next = e)
            : ((r = n.next), (n.next = e), (e.next = r), (t.lastEffect = e))),
      e
    );
  }
  function Es() {
    return it().memoizedState;
  }
  function yl(e, t, n, r) {
    var l = wt();
    ((ye.flags |= e),
      (l.memoizedState = kr(1 | t, n, void 0, r === void 0 ? null : r)));
  }
  function vl(e, t, n, r) {
    var l = it();
    r = r === void 0 ? null : r;
    var o = void 0;
    if (je !== null) {
      var i = je.memoizedState;
      if (((o = i.destroy), r !== null && Ko(r, i.deps))) {
        l.memoizedState = kr(t, n, o, r);
        return;
      }
    }
    ((ye.flags |= e), (l.memoizedState = kr(1 | t, n, o, r)));
  }
  function _s(e, t) {
    return yl(8390656, 8, e, t);
  }
  function bo(e, t) {
    return vl(2048, 8, e, t);
  }
  function Cs(e, t) {
    return vl(4, 2, e, t);
  }
  function js(e, t) {
    return vl(4, 4, e, t);
  }
  function Ps(e, t) {
    if (typeof t == "function")
      return (
        (e = e()),
        t(e),
        function () {
          t(null);
        }
      );
    if (t != null)
      return (
        (e = e()),
        (t.current = e),
        function () {
          t.current = null;
        }
      );
  }
  function zs(e, t, n) {
    return (
      (n = n != null ? n.concat([e]) : null),
      vl(4, 4, Ps.bind(null, t, e), n)
    );
  }
  function ei() {}
  function Ts(e, t) {
    var n = it();
    t = t === void 0 ? null : t;
    var r = n.memoizedState;
    return r !== null && t !== null && Ko(t, r[1])
      ? r[0]
      : ((n.memoizedState = [e, t]), e);
  }
  function Rs(e, t) {
    var n = it();
    t = t === void 0 ? null : t;
    var r = n.memoizedState;
    return r !== null && t !== null && Ko(t, r[1])
      ? r[0]
      : ((e = e()), (n.memoizedState = [e, t]), e);
  }
  function Ns(e, t, n) {
    return (an & 21) === 0
      ? (e.baseState && ((e.baseState = !1), (Ke = !0)), (e.memoizedState = n))
      : (dt(n, t) ||
          ((n = uu()), (ye.lanes |= n), (cn |= n), (e.baseState = !0)),
        t);
  }
  function uf(e, t) {
    var n = ue;
    ((ue = n !== 0 && 4 > n ? n : 4), e(!0));
    var r = Go.transition;
    Go.transition = {};
    try {
      (e(!1), t());
    } finally {
      ((ue = n), (Go.transition = r));
    }
  }
  function Ls() {
    return it().memoizedState;
  }
  function sf(e, t, n) {
    var r = Jt(e);
    if (
      ((n = {
        lane: r,
        action: n,
        hasEagerState: !1,
        eagerState: null,
        next: null,
      }),
      Os(e))
    )
      Is(t, n);
    else if (((n = cs(e, t, n, r)), n !== null)) {
      var l = He();
      (yt(n, e, r, l), Ms(n, t, r));
    }
  }
  function af(e, t, n) {
    var r = Jt(e),
      l = {
        lane: r,
        action: n,
        hasEagerState: !1,
        eagerState: null,
        next: null,
      };
    if (Os(e)) Is(t, l);
    else {
      var o = e.alternate;
      if (
        e.lanes === 0 &&
        (o === null || o.lanes === 0) &&
        ((o = t.lastRenderedReducer), o !== null)
      )
        try {
          var i = t.lastRenderedState,
            u = o(i, n);
          if (((l.hasEagerState = !0), (l.eagerState = u), dt(u, i))) {
            var a = t.interleaved;
            (a === null
              ? ((l.next = l), $o(t))
              : ((l.next = a.next), (a.next = l)),
              (t.interleaved = l));
            return;
          }
        } catch {
        } finally {
        }
      ((n = cs(e, t, l, r)),
        n !== null && ((l = He()), yt(n, e, r, l), Ms(n, t, r)));
    }
  }
  function Os(e) {
    var t = e.alternate;
    return e === ye || (t !== null && t === ye);
  }
  function Is(e, t) {
    Sr = gl = !0;
    var n = e.pending;
    (n === null ? (t.next = t) : ((t.next = n.next), (n.next = t)),
      (e.pending = t));
  }
  function Ms(e, t, n) {
    if ((n & 4194240) !== 0) {
      var r = t.lanes;
      ((r &= e.pendingLanes), (n |= r), (t.lanes = n), to(e, n));
    }
  }
  var Sl = {
      readContext: ot,
      useCallback: Be,
      useContext: Be,
      useEffect: Be,
      useImperativeHandle: Be,
      useInsertionEffect: Be,
      useLayoutEffect: Be,
      useMemo: Be,
      useReducer: Be,
      useRef: Be,
      useState: Be,
      useDebugValue: Be,
      useDeferredValue: Be,
      useTransition: Be,
      useMutableSource: Be,
      useSyncExternalStore: Be,
      useId: Be,
      unstable_isNewReconciler: !1,
    },
    cf = {
      readContext: ot,
      useCallback: function (e, t) {
        return ((wt().memoizedState = [e, t === void 0 ? null : t]), e);
      },
      useContext: ot,
      useEffect: _s,
      useImperativeHandle: function (e, t, n) {
        return (
          (n = n != null ? n.concat([e]) : null),
          yl(4194308, 4, Ps.bind(null, t, e), n)
        );
      },
      useLayoutEffect: function (e, t) {
        return yl(4194308, 4, e, t);
      },
      useInsertionEffect: function (e, t) {
        return yl(4, 2, e, t);
      },
      useMemo: function (e, t) {
        var n = wt();
        return (
          (t = t === void 0 ? null : t),
          (e = e()),
          (n.memoizedState = [e, t]),
          e
        );
      },
      useReducer: function (e, t, n) {
        var r = wt();
        return (
          (t = n !== void 0 ? n(t) : t),
          (r.memoizedState = r.baseState = t),
          (e = {
            pending: null,
            interleaved: null,
            lanes: 0,
            dispatch: null,
            lastRenderedReducer: e,
            lastRenderedState: t,
          }),
          (r.queue = e),
          (e = e.dispatch = sf.bind(null, ye, e)),
          [r.memoizedState, e]
        );
      },
      useRef: function (e) {
        var t = wt();
        return ((e = { current: e }), (t.memoizedState = e));
      },
      useState: ks,
      useDebugValue: ei,
      useDeferredValue: function (e) {
        return (wt().memoizedState = e);
      },
      useTransition: function () {
        var e = ks(!1),
          t = e[0];
        return ((e = uf.bind(null, e[1])), (wt().memoizedState = e), [t, e]);
      },
      useMutableSource: function () {},
      useSyncExternalStore: function (e, t, n) {
        var r = ye,
          l = wt();
        if (me) {
          if (n === void 0) throw Error(d(407));
          n = n();
        } else {
          if (((n = t()), Ne === null)) throw Error(d(349));
          (an & 30) !== 0 || ys(r, t, n);
        }
        l.memoizedState = n;
        var o = { value: n, getSnapshot: t };
        return (
          (l.queue = o),
          _s(Ss.bind(null, r, o, e), [e]),
          (r.flags |= 2048),
          kr(9, vs.bind(null, r, o, n, t), void 0, null),
          n
        );
      },
      useId: function () {
        var e = wt(),
          t = Ne.identifierPrefix;
        if (me) {
          var n = Tt,
            r = zt;
          ((n = (r & ~(1 << (32 - ft(r) - 1))).toString(32) + n),
            (t = ":" + t + "R" + n),
            (n = xr++),
            0 < n && (t += "H" + n.toString(32)),
            (t += ":"));
        } else ((n = of++), (t = ":" + t + "r" + n.toString(32) + ":"));
        return (e.memoizedState = t);
      },
      unstable_isNewReconciler: !1,
    },
    ff = {
      readContext: ot,
      useCallback: Ts,
      useContext: ot,
      useEffect: bo,
      useImperativeHandle: zs,
      useInsertionEffect: Cs,
      useLayoutEffect: js,
      useMemo: Rs,
      useReducer: Zo,
      useRef: Es,
      useState: function () {
        return Zo(wr);
      },
      useDebugValue: ei,
      useDeferredValue: function (e) {
        var t = it();
        return Ns(t, je.memoizedState, e);
      },
      useTransition: function () {
        var e = Zo(wr)[0],
          t = it().memoizedState;
        return [e, t];
      },
      useMutableSource: ms,
      useSyncExternalStore: gs,
      useId: Ls,
      unstable_isNewReconciler: !1,
    },
    df = {
      readContext: ot,
      useCallback: Ts,
      useContext: ot,
      useEffect: bo,
      useImperativeHandle: zs,
      useInsertionEffect: Cs,
      useLayoutEffect: js,
      useMemo: Rs,
      useReducer: qo,
      useRef: Es,
      useState: function () {
        return qo(wr);
      },
      useDebugValue: ei,
      useDeferredValue: function (e) {
        var t = it();
        return je === null ? (t.memoizedState = e) : Ns(t, je.memoizedState, e);
      },
      useTransition: function () {
        var e = qo(wr)[0],
          t = it().memoizedState;
        return [e, t];
      },
      useMutableSource: ms,
      useSyncExternalStore: gs,
      useId: Ls,
      unstable_isNewReconciler: !1,
    };
  function ht(e, t) {
    if (e && e.defaultProps) {
      ((t = m({}, t)), (e = e.defaultProps));
      for (var n in e) t[n] === void 0 && (t[n] = e[n]);
      return t;
    }
    return t;
  }
  function ti(e, t, n, r) {
    ((t = e.memoizedState),
      (n = n(r, t)),
      (n = n == null ? t : m({}, t, n)),
      (e.memoizedState = n),
      e.lanes === 0 && (e.updateQueue.baseState = n));
  }
  var xl = {
    isMounted: function (e) {
      return (e = e._reactInternals) ? tn(e) === e : !1;
    },
    enqueueSetState: function (e, t, n) {
      e = e._reactInternals;
      var r = He(),
        l = Jt(e),
        o = Nt(r, l);
      ((o.payload = t),
        n != null && (o.callback = n),
        (t = Yt(e, o, l)),
        t !== null && (yt(t, e, l, r), dl(t, e, l)));
    },
    enqueueReplaceState: function (e, t, n) {
      e = e._reactInternals;
      var r = He(),
        l = Jt(e),
        o = Nt(r, l);
      ((o.tag = 1),
        (o.payload = t),
        n != null && (o.callback = n),
        (t = Yt(e, o, l)),
        t !== null && (yt(t, e, l, r), dl(t, e, l)));
    },
    enqueueForceUpdate: function (e, t) {
      e = e._reactInternals;
      var n = He(),
        r = Jt(e),
        l = Nt(n, r);
      ((l.tag = 2),
        t != null && (l.callback = t),
        (t = Yt(e, l, r)),
        t !== null && (yt(t, e, r, n), dl(t, e, r)));
    },
  };
  function Ds(e, t, n, r, l, o, i) {
    return (
      (e = e.stateNode),
      typeof e.shouldComponentUpdate == "function"
        ? e.shouldComponentUpdate(r, o, i)
        : t.prototype && t.prototype.isPureReactComponent
          ? !sr(n, r) || !sr(l, o)
          : !0
    );
  }
  function Fs(e, t, n) {
    var r = !1,
      l = Vt,
      o = t.contextType;
    return (
      typeof o == "object" && o !== null
        ? (o = ot(o))
        : ((l = Ge(t) ? rn : Ae.current),
          (r = t.contextTypes),
          (o = (r = r != null) ? Rn(e, l) : Vt)),
      (t = new t(n, o)),
      (e.memoizedState =
        t.state !== null && t.state !== void 0 ? t.state : null),
      (t.updater = xl),
      (e.stateNode = t),
      (t._reactInternals = e),
      r &&
        ((e = e.stateNode),
        (e.__reactInternalMemoizedUnmaskedChildContext = l),
        (e.__reactInternalMemoizedMaskedChildContext = o)),
      t
    );
  }
  function As(e, t, n, r) {
    ((e = t.state),
      typeof t.componentWillReceiveProps == "function" &&
        t.componentWillReceiveProps(n, r),
      typeof t.UNSAFE_componentWillReceiveProps == "function" &&
        t.UNSAFE_componentWillReceiveProps(n, r),
      t.state !== e && xl.enqueueReplaceState(t, t.state, null));
  }
  function ni(e, t, n, r) {
    var l = e.stateNode;
    ((l.props = n), (l.state = e.memoizedState), (l.refs = {}), Wo(e));
    var o = t.contextType;
    (typeof o == "object" && o !== null
      ? (l.context = ot(o))
      : ((o = Ge(t) ? rn : Ae.current), (l.context = Rn(e, o))),
      (l.state = e.memoizedState),
      (o = t.getDerivedStateFromProps),
      typeof o == "function" && (ti(e, t, o, n), (l.state = e.memoizedState)),
      typeof t.getDerivedStateFromProps == "function" ||
        typeof l.getSnapshotBeforeUpdate == "function" ||
        (typeof l.UNSAFE_componentWillMount != "function" &&
          typeof l.componentWillMount != "function") ||
        ((t = l.state),
        typeof l.componentWillMount == "function" && l.componentWillMount(),
        typeof l.UNSAFE_componentWillMount == "function" &&
          l.UNSAFE_componentWillMount(),
        t !== l.state && xl.enqueueReplaceState(l, l.state, null),
        pl(e, n, l, r),
        (l.state = e.memoizedState)),
      typeof l.componentDidMount == "function" && (e.flags |= 4194308));
  }
  function An(e, t) {
    try {
      var n = "",
        r = t;
      do ((n += X(r)), (r = r.return));
      while (r);
      var l = n;
    } catch (o) {
      l =
        `
Error generating stack: ` +
        o.message +
        `
` +
        o.stack;
    }
    return { value: e, source: t, stack: l, digest: null };
  }
  function ri(e, t, n) {
    return { value: e, source: null, stack: n ?? null, digest: t ?? null };
  }
  function li(e, t) {
    try {
      console.error(t.value);
    } catch (n) {
      setTimeout(function () {
        throw n;
      });
    }
  }
  var pf = typeof WeakMap == "function" ? WeakMap : Map;
  function Bs(e, t, n) {
    ((n = Nt(-1, n)), (n.tag = 3), (n.payload = { element: null }));
    var r = t.value;
    return (
      (n.callback = function () {
        (Pl || ((Pl = !0), (Si = r)), li(e, t));
      }),
      n
    );
  }
  function Us(e, t, n) {
    ((n = Nt(-1, n)), (n.tag = 3));
    var r = e.type.getDerivedStateFromError;
    if (typeof r == "function") {
      var l = t.value;
      ((n.payload = function () {
        return r(l);
      }),
        (n.callback = function () {
          li(e, t);
        }));
    }
    var o = e.stateNode;
    return (
      o !== null &&
        typeof o.componentDidCatch == "function" &&
        (n.callback = function () {
          (li(e, t),
            typeof r != "function" &&
              (Kt === null ? (Kt = new Set([this])) : Kt.add(this)));
          var i = t.stack;
          this.componentDidCatch(t.value, {
            componentStack: i !== null ? i : "",
          });
        }),
      n
    );
  }
  function $s(e, t, n) {
    var r = e.pingCache;
    if (r === null) {
      r = e.pingCache = new pf();
      var l = new Set();
      r.set(t, l);
    } else ((l = r.get(t)), l === void 0 && ((l = new Set()), r.set(t, l)));
    l.has(n) || (l.add(n), (e = Pf.bind(null, e, t, n)), t.then(e, e));
  }
  function Ws(e) {
    do {
      var t;
      if (
        ((t = e.tag === 13) &&
          ((t = e.memoizedState),
          (t = t !== null ? t.dehydrated !== null : !0)),
        t)
      )
        return e;
      e = e.return;
    } while (e !== null);
    return null;
  }
  function Vs(e, t, n, r, l) {
    return (e.mode & 1) === 0
      ? (e === t
          ? (e.flags |= 65536)
          : ((e.flags |= 128),
            (n.flags |= 131072),
            (n.flags &= -52805),
            n.tag === 1 &&
              (n.alternate === null
                ? (n.tag = 17)
                : ((t = Nt(-1, 1)), (t.tag = 2), Yt(n, t, 1))),
            (n.lanes |= 1)),
        e)
      : ((e.flags |= 65536), (e.lanes = l), e);
  }
  var hf = se.ReactCurrentOwner,
    Ke = !1;
  function Ve(e, t, n, r) {
    t.child = e === null ? as(t, null, n, r) : In(t, e.child, n, r);
  }
  function Hs(e, t, n, r, l) {
    n = n.render;
    var o = t.ref;
    return (
      Dn(t, l),
      (r = Xo(e, t, n, r, o, l)),
      (n = Jo()),
      e !== null && !Ke
        ? ((t.updateQueue = e.updateQueue),
          (t.flags &= -2053),
          (e.lanes &= ~l),
          Lt(e, t, l))
        : (me && n && Lo(t), (t.flags |= 1), Ve(e, t, r, l), t.child)
    );
  }
  function Qs(e, t, n, r, l) {
    if (e === null) {
      var o = n.type;
      return typeof o == "function" &&
        !ji(o) &&
        o.defaultProps === void 0 &&
        n.compare === null &&
        n.defaultProps === void 0
        ? ((t.tag = 15), (t.type = o), Ys(e, t, o, r, l))
        : ((e = Ol(n.type, null, r, t, t.mode, l)),
          (e.ref = t.ref),
          (e.return = t),
          (t.child = e));
    }
    if (((o = e.child), (e.lanes & l) === 0)) {
      var i = o.memoizedProps;
      if (
        ((n = n.compare), (n = n !== null ? n : sr), n(i, r) && e.ref === t.ref)
      )
        return Lt(e, t, l);
    }
    return (
      (t.flags |= 1),
      (e = qt(o, r)),
      (e.ref = t.ref),
      (e.return = t),
      (t.child = e)
    );
  }
  function Ys(e, t, n, r, l) {
    if (e !== null) {
      var o = e.memoizedProps;
      if (sr(o, r) && e.ref === t.ref)
        if (((Ke = !1), (t.pendingProps = r = o), (e.lanes & l) !== 0))
          (e.flags & 131072) !== 0 && (Ke = !0);
        else return ((t.lanes = e.lanes), Lt(e, t, l));
    }
    return oi(e, t, n, r, l);
  }
  function Gs(e, t, n) {
    var r = t.pendingProps,
      l = r.children,
      o = e !== null ? e.memoizedState : null;
    if (r.mode === "hidden")
      if ((t.mode & 1) === 0)
        ((t.memoizedState = {
          baseLanes: 0,
          cachePool: null,
          transitions: null,
        }),
          fe(Un, nt),
          (nt |= n));
      else {
        if ((n & 1073741824) === 0)
          return (
            (e = o !== null ? o.baseLanes | n : n),
            (t.lanes = t.childLanes = 1073741824),
            (t.memoizedState = {
              baseLanes: e,
              cachePool: null,
              transitions: null,
            }),
            (t.updateQueue = null),
            fe(Un, nt),
            (nt |= e),
            null
          );
        ((t.memoizedState = {
          baseLanes: 0,
          cachePool: null,
          transitions: null,
        }),
          (r = o !== null ? o.baseLanes : n),
          fe(Un, nt),
          (nt |= r));
      }
    else
      (o !== null ? ((r = o.baseLanes | n), (t.memoizedState = null)) : (r = n),
        fe(Un, nt),
        (nt |= r));
    return (Ve(e, t, l, n), t.child);
  }
  function Ks(e, t) {
    var n = t.ref;
    ((e === null && n !== null) || (e !== null && e.ref !== n)) &&
      ((t.flags |= 512), (t.flags |= 2097152));
  }
  function oi(e, t, n, r, l) {
    var o = Ge(n) ? rn : Ae.current;
    return (
      (o = Rn(t, o)),
      Dn(t, l),
      (n = Xo(e, t, n, r, o, l)),
      (r = Jo()),
      e !== null && !Ke
        ? ((t.updateQueue = e.updateQueue),
          (t.flags &= -2053),
          (e.lanes &= ~l),
          Lt(e, t, l))
        : (me && r && Lo(t), (t.flags |= 1), Ve(e, t, n, l), t.child)
    );
  }
  function Xs(e, t, n, r, l) {
    if (Ge(n)) {
      var o = !0;
      ll(t);
    } else o = !1;
    if ((Dn(t, l), t.stateNode === null))
      (kl(e, t), Fs(t, n, r), ni(t, n, r, l), (r = !0));
    else if (e === null) {
      var i = t.stateNode,
        u = t.memoizedProps;
      i.props = u;
      var a = i.context,
        g = n.contextType;
      typeof g == "object" && g !== null
        ? (g = ot(g))
        : ((g = Ge(n) ? rn : Ae.current), (g = Rn(t, g)));
      var w = n.getDerivedStateFromProps,
        k =
          typeof w == "function" ||
          typeof i.getSnapshotBeforeUpdate == "function";
      (k ||
        (typeof i.UNSAFE_componentWillReceiveProps != "function" &&
          typeof i.componentWillReceiveProps != "function") ||
        ((u !== r || a !== g) && As(t, i, r, g)),
        (Qt = !1));
      var x = t.memoizedState;
      ((i.state = x),
        pl(t, r, i, l),
        (a = t.memoizedState),
        u !== r || x !== a || Ye.current || Qt
          ? (typeof w == "function" && (ti(t, n, w, r), (a = t.memoizedState)),
            (u = Qt || Ds(t, n, u, r, x, a, g))
              ? (k ||
                  (typeof i.UNSAFE_componentWillMount != "function" &&
                    typeof i.componentWillMount != "function") ||
                  (typeof i.componentWillMount == "function" &&
                    i.componentWillMount(),
                  typeof i.UNSAFE_componentWillMount == "function" &&
                    i.UNSAFE_componentWillMount()),
                typeof i.componentDidMount == "function" &&
                  (t.flags |= 4194308))
              : (typeof i.componentDidMount == "function" &&
                  (t.flags |= 4194308),
                (t.memoizedProps = r),
                (t.memoizedState = a)),
            (i.props = r),
            (i.state = a),
            (i.context = g),
            (r = u))
          : (typeof i.componentDidMount == "function" && (t.flags |= 4194308),
            (r = !1)));
    } else {
      ((i = t.stateNode),
        fs(e, t),
        (u = t.memoizedProps),
        (g = t.type === t.elementType ? u : ht(t.type, u)),
        (i.props = g),
        (k = t.pendingProps),
        (x = i.context),
        (a = n.contextType),
        typeof a == "object" && a !== null
          ? (a = ot(a))
          : ((a = Ge(n) ? rn : Ae.current), (a = Rn(t, a))));
      var T = n.getDerivedStateFromProps;
      ((w =
        typeof T == "function" ||
        typeof i.getSnapshotBeforeUpdate == "function") ||
        (typeof i.UNSAFE_componentWillReceiveProps != "function" &&
          typeof i.componentWillReceiveProps != "function") ||
        ((u !== k || x !== a) && As(t, i, r, a)),
        (Qt = !1),
        (x = t.memoizedState),
        (i.state = x),
        pl(t, r, i, l));
      var L = t.memoizedState;
      u !== k || x !== L || Ye.current || Qt
        ? (typeof T == "function" && (ti(t, n, T, r), (L = t.memoizedState)),
          (g = Qt || Ds(t, n, g, r, x, L, a) || !1)
            ? (w ||
                (typeof i.UNSAFE_componentWillUpdate != "function" &&
                  typeof i.componentWillUpdate != "function") ||
                (typeof i.componentWillUpdate == "function" &&
                  i.componentWillUpdate(r, L, a),
                typeof i.UNSAFE_componentWillUpdate == "function" &&
                  i.UNSAFE_componentWillUpdate(r, L, a)),
              typeof i.componentDidUpdate == "function" && (t.flags |= 4),
              typeof i.getSnapshotBeforeUpdate == "function" &&
                (t.flags |= 1024))
            : (typeof i.componentDidUpdate != "function" ||
                (u === e.memoizedProps && x === e.memoizedState) ||
                (t.flags |= 4),
              typeof i.getSnapshotBeforeUpdate != "function" ||
                (u === e.memoizedProps && x === e.memoizedState) ||
                (t.flags |= 1024),
              (t.memoizedProps = r),
              (t.memoizedState = L)),
          (i.props = r),
          (i.state = L),
          (i.context = a),
          (r = g))
        : (typeof i.componentDidUpdate != "function" ||
            (u === e.memoizedProps && x === e.memoizedState) ||
            (t.flags |= 4),
          typeof i.getSnapshotBeforeUpdate != "function" ||
            (u === e.memoizedProps && x === e.memoizedState) ||
            (t.flags |= 1024),
          (r = !1));
    }
    return ii(e, t, n, r, o, l);
  }
  function ii(e, t, n, r, l, o) {
    Ks(e, t);
    var i = (t.flags & 128) !== 0;
    if (!r && !i) return (l && es(t, n, !1), Lt(e, t, o));
    ((r = t.stateNode), (hf.current = t));
    var u =
      i && typeof n.getDerivedStateFromError != "function" ? null : r.render();
    return (
      (t.flags |= 1),
      e !== null && i
        ? ((t.child = In(t, e.child, null, o)), (t.child = In(t, null, u, o)))
        : Ve(e, t, u, o),
      (t.memoizedState = r.state),
      l && es(t, n, !0),
      t.child
    );
  }
  function Js(e) {
    var t = e.stateNode;
    (t.pendingContext
      ? qu(e, t.pendingContext, t.pendingContext !== t.context)
      : t.context && qu(e, t.context, !1),
      Vo(e, t.containerInfo));
  }
  function Zs(e, t, n, r, l) {
    return (On(), Do(l), (t.flags |= 256), Ve(e, t, n, r), t.child);
  }
  var ui = { dehydrated: null, treeContext: null, retryLane: 0 };
  function si(e) {
    return { baseLanes: e, cachePool: null, transitions: null };
  }
  function qs(e, t, n) {
    var r = t.pendingProps,
      l = ge.current,
      o = !1,
      i = (t.flags & 128) !== 0,
      u;
    if (
      ((u = i) ||
        (u = e !== null && e.memoizedState === null ? !1 : (l & 2) !== 0),
      u
        ? ((o = !0), (t.flags &= -129))
        : (e === null || e.memoizedState !== null) && (l |= 1),
      fe(ge, l & 1),
      e === null)
    )
      return (
        Mo(t),
        (e = t.memoizedState),
        e !== null && ((e = e.dehydrated), e !== null)
          ? ((t.mode & 1) === 0
              ? (t.lanes = 1)
              : e.data === "$!"
                ? (t.lanes = 8)
                : (t.lanes = 1073741824),
            null)
          : ((i = r.children),
            (e = r.fallback),
            o
              ? ((r = t.mode),
                (o = t.child),
                (i = { mode: "hidden", children: i }),
                (r & 1) === 0 && o !== null
                  ? ((o.childLanes = 0), (o.pendingProps = i))
                  : (o = Il(i, r, 0, null)),
                (e = hn(e, r, n, null)),
                (o.return = t),
                (e.return = t),
                (o.sibling = e),
                (t.child = o),
                (t.child.memoizedState = si(n)),
                (t.memoizedState = ui),
                e)
              : ai(t, i))
      );
    if (((l = e.memoizedState), l !== null && ((u = l.dehydrated), u !== null)))
      return mf(e, t, i, r, u, l, n);
    if (o) {
      ((o = r.fallback), (i = t.mode), (l = e.child), (u = l.sibling));
      var a = { mode: "hidden", children: r.children };
      return (
        (i & 1) === 0 && t.child !== l
          ? ((r = t.child),
            (r.childLanes = 0),
            (r.pendingProps = a),
            (t.deletions = null))
          : ((r = qt(l, a)), (r.subtreeFlags = l.subtreeFlags & 14680064)),
        u !== null ? (o = qt(u, o)) : ((o = hn(o, i, n, null)), (o.flags |= 2)),
        (o.return = t),
        (r.return = t),
        (r.sibling = o),
        (t.child = r),
        (r = o),
        (o = t.child),
        (i = e.child.memoizedState),
        (i =
          i === null
            ? si(n)
            : {
                baseLanes: i.baseLanes | n,
                cachePool: null,
                transitions: i.transitions,
              }),
        (o.memoizedState = i),
        (o.childLanes = e.childLanes & ~n),
        (t.memoizedState = ui),
        r
      );
    }
    return (
      (o = e.child),
      (e = o.sibling),
      (r = qt(o, { mode: "visible", children: r.children })),
      (t.mode & 1) === 0 && (r.lanes = n),
      (r.return = t),
      (r.sibling = null),
      e !== null &&
        ((n = t.deletions),
        n === null ? ((t.deletions = [e]), (t.flags |= 16)) : n.push(e)),
      (t.child = r),
      (t.memoizedState = null),
      r
    );
  }
  function ai(e, t) {
    return (
      (t = Il({ mode: "visible", children: t }, e.mode, 0, null)),
      (t.return = e),
      (e.child = t)
    );
  }
  function wl(e, t, n, r) {
    return (
      r !== null && Do(r),
      In(t, e.child, null, n),
      (e = ai(t, t.pendingProps.children)),
      (e.flags |= 2),
      (t.memoizedState = null),
      e
    );
  }
  function mf(e, t, n, r, l, o, i) {
    if (n)
      return t.flags & 256
        ? ((t.flags &= -257), (r = ri(Error(d(422)))), wl(e, t, i, r))
        : t.memoizedState !== null
          ? ((t.child = e.child), (t.flags |= 128), null)
          : ((o = r.fallback),
            (l = t.mode),
            (r = Il({ mode: "visible", children: r.children }, l, 0, null)),
            (o = hn(o, l, i, null)),
            (o.flags |= 2),
            (r.return = t),
            (o.return = t),
            (r.sibling = o),
            (t.child = r),
            (t.mode & 1) !== 0 && In(t, e.child, null, i),
            (t.child.memoizedState = si(i)),
            (t.memoizedState = ui),
            o);
    if ((t.mode & 1) === 0) return wl(e, t, i, null);
    if (l.data === "$!") {
      if (((r = l.nextSibling && l.nextSibling.dataset), r)) var u = r.dgst;
      return (
        (r = u),
        (o = Error(d(419))),
        (r = ri(o, r, void 0)),
        wl(e, t, i, r)
      );
    }
    if (((u = (i & e.childLanes) !== 0), Ke || u)) {
      if (((r = Ne), r !== null)) {
        switch (i & -i) {
          case 4:
            l = 2;
            break;
          case 16:
            l = 8;
            break;
          case 64:
          case 128:
          case 256:
          case 512:
          case 1024:
          case 2048:
          case 4096:
          case 8192:
          case 16384:
          case 32768:
          case 65536:
          case 131072:
          case 262144:
          case 524288:
          case 1048576:
          case 2097152:
          case 4194304:
          case 8388608:
          case 16777216:
          case 33554432:
          case 67108864:
            l = 32;
            break;
          case 536870912:
            l = 268435456;
            break;
          default:
            l = 0;
        }
        ((l = (l & (r.suspendedLanes | i)) !== 0 ? 0 : l),
          l !== 0 &&
            l !== o.retryLane &&
            ((o.retryLane = l), Rt(e, l), yt(r, e, l, -1)));
      }
      return (Ci(), (r = ri(Error(d(421)))), wl(e, t, i, r));
    }
    return l.data === "$?"
      ? ((t.flags |= 128),
        (t.child = e.child),
        (t = zf.bind(null, e)),
        (l._reactRetry = t),
        null)
      : ((e = o.treeContext),
        (tt = $t(l.nextSibling)),
        (et = t),
        (me = !0),
        (pt = null),
        e !== null &&
          ((rt[lt++] = zt),
          (rt[lt++] = Tt),
          (rt[lt++] = ln),
          (zt = e.id),
          (Tt = e.overflow),
          (ln = t)),
        (t = ai(t, r.children)),
        (t.flags |= 4096),
        t);
  }
  function bs(e, t, n) {
    e.lanes |= t;
    var r = e.alternate;
    (r !== null && (r.lanes |= t), Uo(e.return, t, n));
  }
  function ci(e, t, n, r, l) {
    var o = e.memoizedState;
    o === null
      ? (e.memoizedState = {
          isBackwards: t,
          rendering: null,
          renderingStartTime: 0,
          last: r,
          tail: n,
          tailMode: l,
        })
      : ((o.isBackwards = t),
        (o.rendering = null),
        (o.renderingStartTime = 0),
        (o.last = r),
        (o.tail = n),
        (o.tailMode = l));
  }
  function ea(e, t, n) {
    var r = t.pendingProps,
      l = r.revealOrder,
      o = r.tail;
    if ((Ve(e, t, r.children, n), (r = ge.current), (r & 2) !== 0))
      ((r = (r & 1) | 2), (t.flags |= 128));
    else {
      if (e !== null && (e.flags & 128) !== 0)
        e: for (e = t.child; e !== null; ) {
          if (e.tag === 13) e.memoizedState !== null && bs(e, n, t);
          else if (e.tag === 19) bs(e, n, t);
          else if (e.child !== null) {
            ((e.child.return = e), (e = e.child));
            continue;
          }
          if (e === t) break e;
          for (; e.sibling === null; ) {
            if (e.return === null || e.return === t) break e;
            e = e.return;
          }
          ((e.sibling.return = e.return), (e = e.sibling));
        }
      r &= 1;
    }
    if ((fe(ge, r), (t.mode & 1) === 0)) t.memoizedState = null;
    else
      switch (l) {
        case "forwards":
          for (n = t.child, l = null; n !== null; )
            ((e = n.alternate),
              e !== null && hl(e) === null && (l = n),
              (n = n.sibling));
          ((n = l),
            n === null
              ? ((l = t.child), (t.child = null))
              : ((l = n.sibling), (n.sibling = null)),
            ci(t, !1, l, n, o));
          break;
        case "backwards":
          for (n = null, l = t.child, t.child = null; l !== null; ) {
            if (((e = l.alternate), e !== null && hl(e) === null)) {
              t.child = l;
              break;
            }
            ((e = l.sibling), (l.sibling = n), (n = l), (l = e));
          }
          ci(t, !0, n, null, o);
          break;
        case "together":
          ci(t, !1, null, null, void 0);
          break;
        default:
          t.memoizedState = null;
      }
    return t.child;
  }
  function kl(e, t) {
    (t.mode & 1) === 0 &&
      e !== null &&
      ((e.alternate = null), (t.alternate = null), (t.flags |= 2));
  }
  function Lt(e, t, n) {
    if (
      (e !== null && (t.dependencies = e.dependencies),
      (cn |= t.lanes),
      (n & t.childLanes) === 0)
    )
      return null;
    if (e !== null && t.child !== e.child) throw Error(d(153));
    if (t.child !== null) {
      for (
        e = t.child, n = qt(e, e.pendingProps), t.child = n, n.return = t;
        e.sibling !== null;
      )
        ((e = e.sibling),
          (n = n.sibling = qt(e, e.pendingProps)),
          (n.return = t));
      n.sibling = null;
    }
    return t.child;
  }
  function gf(e, t, n) {
    switch (t.tag) {
      case 3:
        (Js(t), On());
        break;
      case 5:
        hs(t);
        break;
      case 1:
        Ge(t.type) && ll(t);
        break;
      case 4:
        Vo(t, t.stateNode.containerInfo);
        break;
      case 10:
        var r = t.type._context,
          l = t.memoizedProps.value;
        (fe(cl, r._currentValue), (r._currentValue = l));
        break;
      case 13:
        if (((r = t.memoizedState), r !== null))
          return r.dehydrated !== null
            ? (fe(ge, ge.current & 1), (t.flags |= 128), null)
            : (n & t.child.childLanes) !== 0
              ? qs(e, t, n)
              : (fe(ge, ge.current & 1),
                (e = Lt(e, t, n)),
                e !== null ? e.sibling : null);
        fe(ge, ge.current & 1);
        break;
      case 19:
        if (((r = (n & t.childLanes) !== 0), (e.flags & 128) !== 0)) {
          if (r) return ea(e, t, n);
          t.flags |= 128;
        }
        if (
          ((l = t.memoizedState),
          l !== null &&
            ((l.rendering = null), (l.tail = null), (l.lastEffect = null)),
          fe(ge, ge.current),
          r)
        )
          break;
        return null;
      case 22:
      case 23:
        return ((t.lanes = 0), Gs(e, t, n));
    }
    return Lt(e, t, n);
  }
  var ta, fi, na, ra;
  ((ta = function (e, t) {
    for (var n = t.child; n !== null; ) {
      if (n.tag === 5 || n.tag === 6) e.appendChild(n.stateNode);
      else if (n.tag !== 4 && n.child !== null) {
        ((n.child.return = n), (n = n.child));
        continue;
      }
      if (n === t) break;
      for (; n.sibling === null; ) {
        if (n.return === null || n.return === t) return;
        n = n.return;
      }
      ((n.sibling.return = n.return), (n = n.sibling));
    }
  }),
    (fi = function () {}),
    (na = function (e, t, n, r) {
      var l = e.memoizedProps;
      if (l !== r) {
        ((e = t.stateNode), sn(xt.current));
        var o = null;
        switch (n) {
          case "input":
            ((l = Vn(e, l)), (r = Vn(e, r)), (o = []));
            break;
          case "select":
            ((l = m({}, l, { value: void 0 })),
              (r = m({}, r, { value: void 0 })),
              (o = []));
            break;
          case "textarea":
            ((l = vn(e, l)), (r = vn(e, r)), (o = []));
            break;
          default:
            typeof l.onClick != "function" &&
              typeof r.onClick == "function" &&
              (e.onclick = tl);
        }
        Hl(n, r);
        var i;
        n = null;
        for (g in l)
          if (!r.hasOwnProperty(g) && l.hasOwnProperty(g) && l[g] != null)
            if (g === "style") {
              var u = l[g];
              for (i in u) u.hasOwnProperty(i) && (n || (n = {}), (n[i] = ""));
            } else
              g !== "dangerouslySetInnerHTML" &&
                g !== "children" &&
                g !== "suppressContentEditableWarning" &&
                g !== "suppressHydrationWarning" &&
                g !== "autoFocus" &&
                (C.hasOwnProperty(g)
                  ? o || (o = [])
                  : (o = o || []).push(g, null));
        for (g in r) {
          var a = r[g];
          if (
            ((u = l != null ? l[g] : void 0),
            r.hasOwnProperty(g) && a !== u && (a != null || u != null))
          )
            if (g === "style")
              if (u) {
                for (i in u)
                  !u.hasOwnProperty(i) ||
                    (a && a.hasOwnProperty(i)) ||
                    (n || (n = {}), (n[i] = ""));
                for (i in a)
                  a.hasOwnProperty(i) &&
                    u[i] !== a[i] &&
                    (n || (n = {}), (n[i] = a[i]));
              } else (n || (o || (o = []), o.push(g, n)), (n = a));
            else
              g === "dangerouslySetInnerHTML"
                ? ((a = a ? a.__html : void 0),
                  (u = u ? u.__html : void 0),
                  a != null && u !== a && (o = o || []).push(g, a))
                : g === "children"
                  ? (typeof a != "string" && typeof a != "number") ||
                    (o = o || []).push(g, "" + a)
                  : g !== "suppressContentEditableWarning" &&
                    g !== "suppressHydrationWarning" &&
                    (C.hasOwnProperty(g)
                      ? (a != null && g === "onScroll" && pe("scroll", e),
                        o || u === a || (o = []))
                      : (o = o || []).push(g, a));
        }
        n && (o = o || []).push("style", n);
        var g = o;
        (t.updateQueue = g) && (t.flags |= 4);
      }
    }),
    (ra = function (e, t, n, r) {
      n !== r && (t.flags |= 4);
    }));
  function Er(e, t) {
    if (!me)
      switch (e.tailMode) {
        case "hidden":
          t = e.tail;
          for (var n = null; t !== null; )
            (t.alternate !== null && (n = t), (t = t.sibling));
          n === null ? (e.tail = null) : (n.sibling = null);
          break;
        case "collapsed":
          n = e.tail;
          for (var r = null; n !== null; )
            (n.alternate !== null && (r = n), (n = n.sibling));
          r === null
            ? t || e.tail === null
              ? (e.tail = null)
              : (e.tail.sibling = null)
            : (r.sibling = null);
      }
  }
  function Ue(e) {
    var t = e.alternate !== null && e.alternate.child === e.child,
      n = 0,
      r = 0;
    if (t)
      for (var l = e.child; l !== null; )
        ((n |= l.lanes | l.childLanes),
          (r |= l.subtreeFlags & 14680064),
          (r |= l.flags & 14680064),
          (l.return = e),
          (l = l.sibling));
    else
      for (l = e.child; l !== null; )
        ((n |= l.lanes | l.childLanes),
          (r |= l.subtreeFlags),
          (r |= l.flags),
          (l.return = e),
          (l = l.sibling));
    return ((e.subtreeFlags |= r), (e.childLanes = n), t);
  }
  function yf(e, t, n) {
    var r = t.pendingProps;
    switch ((Oo(t), t.tag)) {
      case 2:
      case 16:
      case 15:
      case 0:
      case 11:
      case 7:
      case 8:
      case 12:
      case 9:
      case 14:
        return (Ue(t), null);
      case 1:
        return (Ge(t.type) && rl(), Ue(t), null);
      case 3:
        return (
          (r = t.stateNode),
          Fn(),
          he(Ye),
          he(Ae),
          Yo(),
          r.pendingContext &&
            ((r.context = r.pendingContext), (r.pendingContext = null)),
          (e === null || e.child === null) &&
            (sl(t)
              ? (t.flags |= 4)
              : e === null ||
                (e.memoizedState.isDehydrated && (t.flags & 256) === 0) ||
                ((t.flags |= 1024), pt !== null && (ki(pt), (pt = null)))),
          fi(e, t),
          Ue(t),
          null
        );
      case 5:
        Ho(t);
        var l = sn(vr.current);
        if (((n = t.type), e !== null && t.stateNode != null))
          (na(e, t, n, r, l),
            e.ref !== t.ref && ((t.flags |= 512), (t.flags |= 2097152)));
        else {
          if (!r) {
            if (t.stateNode === null) throw Error(d(166));
            return (Ue(t), null);
          }
          if (((e = sn(xt.current)), sl(t))) {
            ((r = t.stateNode), (n = t.type));
            var o = t.memoizedProps;
            switch (((r[St] = t), (r[pr] = o), (e = (t.mode & 1) !== 0), n)) {
              case "dialog":
                (pe("cancel", r), pe("close", r));
                break;
              case "iframe":
              case "object":
              case "embed":
                pe("load", r);
                break;
              case "video":
              case "audio":
                for (l = 0; l < cr.length; l++) pe(cr[l], r);
                break;
              case "source":
                pe("error", r);
                break;
              case "img":
              case "image":
              case "link":
                (pe("error", r), pe("load", r));
                break;
              case "details":
                pe("toggle", r);
                break;
              case "input":
                (Nr(r, o), pe("invalid", r));
                break;
              case "select":
                ((r._wrapperState = { wasMultiple: !!o.multiple }),
                  pe("invalid", r));
                break;
              case "textarea":
                (Ui(r, o), pe("invalid", r));
            }
            (Hl(n, o), (l = null));
            for (var i in o)
              if (o.hasOwnProperty(i)) {
                var u = o[i];
                i === "children"
                  ? typeof u == "string"
                    ? r.textContent !== u &&
                      (o.suppressHydrationWarning !== !0 &&
                        el(r.textContent, u, e),
                      (l = ["children", u]))
                    : typeof u == "number" &&
                      r.textContent !== "" + u &&
                      (o.suppressHydrationWarning !== !0 &&
                        el(r.textContent, u, e),
                      (l = ["children", "" + u]))
                  : C.hasOwnProperty(i) &&
                    u != null &&
                    i === "onScroll" &&
                    pe("scroll", r);
              }
            switch (n) {
              case "input":
                (mn(r), gn(r, o, !0));
                break;
              case "textarea":
                (mn(r), Wi(r));
                break;
              case "select":
              case "option":
                break;
              default:
                typeof o.onClick == "function" && (r.onclick = tl);
            }
            ((r = l), (t.updateQueue = r), r !== null && (t.flags |= 4));
          } else {
            ((i = l.nodeType === 9 ? l : l.ownerDocument),
              e === "http://www.w3.org/1999/xhtml" && (e = Vi(n)),
              e === "http://www.w3.org/1999/xhtml"
                ? n === "script"
                  ? ((e = i.createElement("div")),
                    (e.innerHTML = "<script><\/script>"),
                    (e = e.removeChild(e.firstChild)))
                  : typeof r.is == "string"
                    ? (e = i.createElement(n, { is: r.is }))
                    : ((e = i.createElement(n)),
                      n === "select" &&
                        ((i = e),
                        r.multiple
                          ? (i.multiple = !0)
                          : r.size && (i.size = r.size)))
                : (e = i.createElementNS(e, n)),
              (e[St] = t),
              (e[pr] = r),
              ta(e, t, !1, !1),
              (t.stateNode = e));
            e: {
              switch (((i = Ql(n, r)), n)) {
                case "dialog":
                  (pe("cancel", e), pe("close", e), (l = r));
                  break;
                case "iframe":
                case "object":
                case "embed":
                  (pe("load", e), (l = r));
                  break;
                case "video":
                case "audio":
                  for (l = 0; l < cr.length; l++) pe(cr[l], e);
                  l = r;
                  break;
                case "source":
                  (pe("error", e), (l = r));
                  break;
                case "img":
                case "image":
                case "link":
                  (pe("error", e), pe("load", e), (l = r));
                  break;
                case "details":
                  (pe("toggle", e), (l = r));
                  break;
                case "input":
                  (Nr(e, r), (l = Vn(e, r)), pe("invalid", e));
                  break;
                case "option":
                  l = r;
                  break;
                case "select":
                  ((e._wrapperState = { wasMultiple: !!r.multiple }),
                    (l = m({}, r, { value: void 0 })),
                    pe("invalid", e));
                  break;
                case "textarea":
                  (Ui(e, r), (l = vn(e, r)), pe("invalid", e));
                  break;
                default:
                  l = r;
              }
              (Hl(n, l), (u = l));
              for (o in u)
                if (u.hasOwnProperty(o)) {
                  var a = u[o];
                  o === "style"
                    ? Yi(e, a)
                    : o === "dangerouslySetInnerHTML"
                      ? ((a = a ? a.__html : void 0), a != null && Hi(e, a))
                      : o === "children"
                        ? typeof a == "string"
                          ? (n !== "textarea" || a !== "") && Qn(e, a)
                          : typeof a == "number" && Qn(e, "" + a)
                        : o !== "suppressContentEditableWarning" &&
                          o !== "suppressHydrationWarning" &&
                          o !== "autoFocus" &&
                          (C.hasOwnProperty(o)
                            ? a != null && o === "onScroll" && pe("scroll", e)
                            : a != null && ve(e, o, a, i));
                }
              switch (n) {
                case "input":
                  (mn(e), gn(e, r, !1));
                  break;
                case "textarea":
                  (mn(e), Wi(e));
                  break;
                case "option":
                  r.value != null && e.setAttribute("value", "" + ne(r.value));
                  break;
                case "select":
                  ((e.multiple = !!r.multiple),
                    (o = r.value),
                    o != null
                      ? Ct(e, !!r.multiple, o, !1)
                      : r.defaultValue != null &&
                        Ct(e, !!r.multiple, r.defaultValue, !0));
                  break;
                default:
                  typeof l.onClick == "function" && (e.onclick = tl);
              }
              switch (n) {
                case "button":
                case "input":
                case "select":
                case "textarea":
                  r = !!r.autoFocus;
                  break e;
                case "img":
                  r = !0;
                  break e;
                default:
                  r = !1;
              }
            }
            r && (t.flags |= 4);
          }
          t.ref !== null && ((t.flags |= 512), (t.flags |= 2097152));
        }
        return (Ue(t), null);
      case 6:
        if (e && t.stateNode != null) ra(e, t, e.memoizedProps, r);
        else {
          if (typeof r != "string" && t.stateNode === null) throw Error(d(166));
          if (((n = sn(vr.current)), sn(xt.current), sl(t))) {
            if (
              ((r = t.stateNode),
              (n = t.memoizedProps),
              (r[St] = t),
              (o = r.nodeValue !== n) && ((e = et), e !== null))
            )
              switch (e.tag) {
                case 3:
                  el(r.nodeValue, n, (e.mode & 1) !== 0);
                  break;
                case 5:
                  e.memoizedProps.suppressHydrationWarning !== !0 &&
                    el(r.nodeValue, n, (e.mode & 1) !== 0);
              }
            o && (t.flags |= 4);
          } else
            ((r = (n.nodeType === 9 ? n : n.ownerDocument).createTextNode(r)),
              (r[St] = t),
              (t.stateNode = r));
        }
        return (Ue(t), null);
      case 13:
        if (
          (he(ge),
          (r = t.memoizedState),
          e === null ||
            (e.memoizedState !== null && e.memoizedState.dehydrated !== null))
        ) {
          if (me && tt !== null && (t.mode & 1) !== 0 && (t.flags & 128) === 0)
            (is(), On(), (t.flags |= 98560), (o = !1));
          else if (((o = sl(t)), r !== null && r.dehydrated !== null)) {
            if (e === null) {
              if (!o) throw Error(d(318));
              if (
                ((o = t.memoizedState),
                (o = o !== null ? o.dehydrated : null),
                !o)
              )
                throw Error(d(317));
              o[St] = t;
            } else
              (On(),
                (t.flags & 128) === 0 && (t.memoizedState = null),
                (t.flags |= 4));
            (Ue(t), (o = !1));
          } else (pt !== null && (ki(pt), (pt = null)), (o = !0));
          if (!o) return t.flags & 65536 ? t : null;
        }
        return (t.flags & 128) !== 0
          ? ((t.lanes = n), t)
          : ((r = r !== null),
            r !== (e !== null && e.memoizedState !== null) &&
              r &&
              ((t.child.flags |= 8192),
              (t.mode & 1) !== 0 &&
                (e === null || (ge.current & 1) !== 0
                  ? Pe === 0 && (Pe = 3)
                  : Ci())),
            t.updateQueue !== null && (t.flags |= 4),
            Ue(t),
            null);
      case 4:
        return (
          Fn(),
          fi(e, t),
          e === null && fr(t.stateNode.containerInfo),
          Ue(t),
          null
        );
      case 10:
        return (Bo(t.type._context), Ue(t), null);
      case 17:
        return (Ge(t.type) && rl(), Ue(t), null);
      case 19:
        if ((he(ge), (o = t.memoizedState), o === null)) return (Ue(t), null);
        if (((r = (t.flags & 128) !== 0), (i = o.rendering), i === null))
          if (r) Er(o, !1);
          else {
            if (Pe !== 0 || (e !== null && (e.flags & 128) !== 0))
              for (e = t.child; e !== null; ) {
                if (((i = hl(e)), i !== null)) {
                  for (
                    t.flags |= 128,
                      Er(o, !1),
                      r = i.updateQueue,
                      r !== null && ((t.updateQueue = r), (t.flags |= 4)),
                      t.subtreeFlags = 0,
                      r = n,
                      n = t.child;
                    n !== null;
                  )
                    ((o = n),
                      (e = r),
                      (o.flags &= 14680066),
                      (i = o.alternate),
                      i === null
                        ? ((o.childLanes = 0),
                          (o.lanes = e),
                          (o.child = null),
                          (o.subtreeFlags = 0),
                          (o.memoizedProps = null),
                          (o.memoizedState = null),
                          (o.updateQueue = null),
                          (o.dependencies = null),
                          (o.stateNode = null))
                        : ((o.childLanes = i.childLanes),
                          (o.lanes = i.lanes),
                          (o.child = i.child),
                          (o.subtreeFlags = 0),
                          (o.deletions = null),
                          (o.memoizedProps = i.memoizedProps),
                          (o.memoizedState = i.memoizedState),
                          (o.updateQueue = i.updateQueue),
                          (o.type = i.type),
                          (e = i.dependencies),
                          (o.dependencies =
                            e === null
                              ? null
                              : {
                                  lanes: e.lanes,
                                  firstContext: e.firstContext,
                                })),
                      (n = n.sibling));
                  return (fe(ge, (ge.current & 1) | 2), t.child);
                }
                e = e.sibling;
              }
            o.tail !== null &&
              ke() > $n &&
              ((t.flags |= 128), (r = !0), Er(o, !1), (t.lanes = 4194304));
          }
        else {
          if (!r)
            if (((e = hl(i)), e !== null)) {
              if (
                ((t.flags |= 128),
                (r = !0),
                (n = e.updateQueue),
                n !== null && ((t.updateQueue = n), (t.flags |= 4)),
                Er(o, !0),
                o.tail === null &&
                  o.tailMode === "hidden" &&
                  !i.alternate &&
                  !me)
              )
                return (Ue(t), null);
            } else
              2 * ke() - o.renderingStartTime > $n &&
                n !== 1073741824 &&
                ((t.flags |= 128), (r = !0), Er(o, !1), (t.lanes = 4194304));
          o.isBackwards
            ? ((i.sibling = t.child), (t.child = i))
            : ((n = o.last),
              n !== null ? (n.sibling = i) : (t.child = i),
              (o.last = i));
        }
        return o.tail !== null
          ? ((t = o.tail),
            (o.rendering = t),
            (o.tail = t.sibling),
            (o.renderingStartTime = ke()),
            (t.sibling = null),
            (n = ge.current),
            fe(ge, r ? (n & 1) | 2 : n & 1),
            t)
          : (Ue(t), null);
      case 22:
      case 23:
        return (
          _i(),
          (r = t.memoizedState !== null),
          e !== null && (e.memoizedState !== null) !== r && (t.flags |= 8192),
          r && (t.mode & 1) !== 0
            ? (nt & 1073741824) !== 0 &&
              (Ue(t), t.subtreeFlags & 6 && (t.flags |= 8192))
            : Ue(t),
          null
        );
      case 24:
        return null;
      case 25:
        return null;
    }
    throw Error(d(156, t.tag));
  }
  function vf(e, t) {
    switch ((Oo(t), t.tag)) {
      case 1:
        return (
          Ge(t.type) && rl(),
          (e = t.flags),
          e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null
        );
      case 3:
        return (
          Fn(),
          he(Ye),
          he(Ae),
          Yo(),
          (e = t.flags),
          (e & 65536) !== 0 && (e & 128) === 0
            ? ((t.flags = (e & -65537) | 128), t)
            : null
        );
      case 5:
        return (Ho(t), null);
      case 13:
        if (
          (he(ge), (e = t.memoizedState), e !== null && e.dehydrated !== null)
        ) {
          if (t.alternate === null) throw Error(d(340));
          On();
        }
        return (
          (e = t.flags),
          e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null
        );
      case 19:
        return (he(ge), null);
      case 4:
        return (Fn(), null);
      case 10:
        return (Bo(t.type._context), null);
      case 22:
      case 23:
        return (_i(), null);
      case 24:
        return null;
      default:
        return null;
    }
  }
  var El = !1,
    $e = !1,
    Sf = typeof WeakSet == "function" ? WeakSet : Set,
    N = null;
  function Bn(e, t) {
    var n = e.ref;
    if (n !== null)
      if (typeof n == "function")
        try {
          n(null);
        } catch (r) {
          xe(e, t, r);
        }
      else n.current = null;
  }
  function di(e, t, n) {
    try {
      n();
    } catch (r) {
      xe(e, t, r);
    }
  }
  var la = !1;
  function xf(e, t) {
    if (((_o = Vr), (e = Du()), go(e))) {
      if ("selectionStart" in e)
        var n = { start: e.selectionStart, end: e.selectionEnd };
      else
        e: {
          n = ((n = e.ownerDocument) && n.defaultView) || window;
          var r = n.getSelection && n.getSelection();
          if (r && r.rangeCount !== 0) {
            n = r.anchorNode;
            var l = r.anchorOffset,
              o = r.focusNode;
            r = r.focusOffset;
            try {
              (n.nodeType, o.nodeType);
            } catch {
              n = null;
              break e;
            }
            var i = 0,
              u = -1,
              a = -1,
              g = 0,
              w = 0,
              k = e,
              x = null;
            t: for (;;) {
              for (
                var T;
                k !== n || (l !== 0 && k.nodeType !== 3) || (u = i + l),
                  k !== o || (r !== 0 && k.nodeType !== 3) || (a = i + r),
                  k.nodeType === 3 && (i += k.nodeValue.length),
                  (T = k.firstChild) !== null;
              )
                ((x = k), (k = T));
              for (;;) {
                if (k === e) break t;
                if (
                  (x === n && ++g === l && (u = i),
                  x === o && ++w === r && (a = i),
                  (T = k.nextSibling) !== null)
                )
                  break;
                ((k = x), (x = k.parentNode));
              }
              k = T;
            }
            n = u === -1 || a === -1 ? null : { start: u, end: a };
          } else n = null;
        }
      n = n || { start: 0, end: 0 };
    } else n = null;
    for (
      Co = { focusedElem: e, selectionRange: n }, Vr = !1, N = t;
      N !== null;
    )
      if (((t = N), (e = t.child), (t.subtreeFlags & 1028) !== 0 && e !== null))
        ((e.return = t), (N = e));
      else
        for (; N !== null; ) {
          t = N;
          try {
            var L = t.alternate;
            if ((t.flags & 1024) !== 0)
              switch (t.tag) {
                case 0:
                case 11:
                case 15:
                  break;
                case 1:
                  if (L !== null) {
                    var O = L.memoizedProps,
                      Ee = L.memoizedState,
                      p = t.stateNode,
                      f = p.getSnapshotBeforeUpdate(
                        t.elementType === t.type ? O : ht(t.type, O),
                        Ee,
                      );
                    p.__reactInternalSnapshotBeforeUpdate = f;
                  }
                  break;
                case 3:
                  var h = t.stateNode.containerInfo;
                  h.nodeType === 1
                    ? (h.textContent = "")
                    : h.nodeType === 9 &&
                      h.documentElement &&
                      h.removeChild(h.documentElement);
                  break;
                case 5:
                case 6:
                case 4:
                case 17:
                  break;
                default:
                  throw Error(d(163));
              }
          } catch (E) {
            xe(t, t.return, E);
          }
          if (((e = t.sibling), e !== null)) {
            ((e.return = t.return), (N = e));
            break;
          }
          N = t.return;
        }
    return ((L = la), (la = !1), L);
  }
  function _r(e, t, n) {
    var r = t.updateQueue;
    if (((r = r !== null ? r.lastEffect : null), r !== null)) {
      var l = (r = r.next);
      do {
        if ((l.tag & e) === e) {
          var o = l.destroy;
          ((l.destroy = void 0), o !== void 0 && di(t, n, o));
        }
        l = l.next;
      } while (l !== r);
    }
  }
  function _l(e, t) {
    if (
      ((t = t.updateQueue), (t = t !== null ? t.lastEffect : null), t !== null)
    ) {
      var n = (t = t.next);
      do {
        if ((n.tag & e) === e) {
          var r = n.create;
          n.destroy = r();
        }
        n = n.next;
      } while (n !== t);
    }
  }
  function pi(e) {
    var t = e.ref;
    if (t !== null) {
      var n = e.stateNode;
      switch (e.tag) {
        case 5:
          e = n;
          break;
        default:
          e = n;
      }
      typeof t == "function" ? t(e) : (t.current = e);
    }
  }
  function oa(e) {
    var t = e.alternate;
    (t !== null && ((e.alternate = null), oa(t)),
      (e.child = null),
      (e.deletions = null),
      (e.sibling = null),
      e.tag === 5 &&
        ((t = e.stateNode),
        t !== null &&
          (delete t[St],
          delete t[pr],
          delete t[To],
          delete t[tf],
          delete t[nf])),
      (e.stateNode = null),
      (e.return = null),
      (e.dependencies = null),
      (e.memoizedProps = null),
      (e.memoizedState = null),
      (e.pendingProps = null),
      (e.stateNode = null),
      (e.updateQueue = null));
  }
  function ia(e) {
    return e.tag === 5 || e.tag === 3 || e.tag === 4;
  }
  function ua(e) {
    e: for (;;) {
      for (; e.sibling === null; ) {
        if (e.return === null || ia(e.return)) return null;
        e = e.return;
      }
      for (
        e.sibling.return = e.return, e = e.sibling;
        e.tag !== 5 && e.tag !== 6 && e.tag !== 18;
      ) {
        if (e.flags & 2 || e.child === null || e.tag === 4) continue e;
        ((e.child.return = e), (e = e.child));
      }
      if (!(e.flags & 2)) return e.stateNode;
    }
  }
  function hi(e, t, n) {
    var r = e.tag;
    if (r === 5 || r === 6)
      ((e = e.stateNode),
        t
          ? n.nodeType === 8
            ? n.parentNode.insertBefore(e, t)
            : n.insertBefore(e, t)
          : (n.nodeType === 8
              ? ((t = n.parentNode), t.insertBefore(e, n))
              : ((t = n), t.appendChild(e)),
            (n = n._reactRootContainer),
            n != null || t.onclick !== null || (t.onclick = tl)));
    else if (r !== 4 && ((e = e.child), e !== null))
      for (hi(e, t, n), e = e.sibling; e !== null; )
        (hi(e, t, n), (e = e.sibling));
  }
  function mi(e, t, n) {
    var r = e.tag;
    if (r === 5 || r === 6)
      ((e = e.stateNode), t ? n.insertBefore(e, t) : n.appendChild(e));
    else if (r !== 4 && ((e = e.child), e !== null))
      for (mi(e, t, n), e = e.sibling; e !== null; )
        (mi(e, t, n), (e = e.sibling));
  }
  var Me = null,
    mt = !1;
  function Gt(e, t, n) {
    for (n = n.child; n !== null; ) (sa(e, t, n), (n = n.sibling));
  }
  function sa(e, t, n) {
    if (vt && typeof vt.onCommitFiberUnmount == "function")
      try {
        vt.onCommitFiberUnmount(Fr, n);
      } catch {}
    switch (n.tag) {
      case 5:
        $e || Bn(n, t);
      case 6:
        var r = Me,
          l = mt;
        ((Me = null),
          Gt(e, t, n),
          (Me = r),
          (mt = l),
          Me !== null &&
            (mt
              ? ((e = Me),
                (n = n.stateNode),
                e.nodeType === 8
                  ? e.parentNode.removeChild(n)
                  : e.removeChild(n))
              : Me.removeChild(n.stateNode)));
        break;
      case 18:
        Me !== null &&
          (mt
            ? ((e = Me),
              (n = n.stateNode),
              e.nodeType === 8
                ? zo(e.parentNode, n)
                : e.nodeType === 1 && zo(e, n),
              nr(e))
            : zo(Me, n.stateNode));
        break;
      case 4:
        ((r = Me),
          (l = mt),
          (Me = n.stateNode.containerInfo),
          (mt = !0),
          Gt(e, t, n),
          (Me = r),
          (mt = l));
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        if (
          !$e &&
          ((r = n.updateQueue), r !== null && ((r = r.lastEffect), r !== null))
        ) {
          l = r = r.next;
          do {
            var o = l,
              i = o.destroy;
            ((o = o.tag),
              i !== void 0 && ((o & 2) !== 0 || (o & 4) !== 0) && di(n, t, i),
              (l = l.next));
          } while (l !== r);
        }
        Gt(e, t, n);
        break;
      case 1:
        if (
          !$e &&
          (Bn(n, t),
          (r = n.stateNode),
          typeof r.componentWillUnmount == "function")
        )
          try {
            ((r.props = n.memoizedProps),
              (r.state = n.memoizedState),
              r.componentWillUnmount());
          } catch (u) {
            xe(n, t, u);
          }
        Gt(e, t, n);
        break;
      case 21:
        Gt(e, t, n);
        break;
      case 22:
        n.mode & 1
          ? (($e = (r = $e) || n.memoizedState !== null), Gt(e, t, n), ($e = r))
          : Gt(e, t, n);
        break;
      default:
        Gt(e, t, n);
    }
  }
  function aa(e) {
    var t = e.updateQueue;
    if (t !== null) {
      e.updateQueue = null;
      var n = e.stateNode;
      (n === null && (n = e.stateNode = new Sf()),
        t.forEach(function (r) {
          var l = Tf.bind(null, e, r);
          n.has(r) || (n.add(r), r.then(l, l));
        }));
    }
  }
  function gt(e, t) {
    var n = t.deletions;
    if (n !== null)
      for (var r = 0; r < n.length; r++) {
        var l = n[r];
        try {
          var o = e,
            i = t,
            u = i;
          e: for (; u !== null; ) {
            switch (u.tag) {
              case 5:
                ((Me = u.stateNode), (mt = !1));
                break e;
              case 3:
                ((Me = u.stateNode.containerInfo), (mt = !0));
                break e;
              case 4:
                ((Me = u.stateNode.containerInfo), (mt = !0));
                break e;
            }
            u = u.return;
          }
          if (Me === null) throw Error(d(160));
          (sa(o, i, l), (Me = null), (mt = !1));
          var a = l.alternate;
          (a !== null && (a.return = null), (l.return = null));
        } catch (g) {
          xe(l, t, g);
        }
      }
    if (t.subtreeFlags & 12854)
      for (t = t.child; t !== null; ) (ca(t, e), (t = t.sibling));
  }
  function ca(e, t) {
    var n = e.alternate,
      r = e.flags;
    switch (e.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        if ((gt(t, e), kt(e), r & 4)) {
          try {
            (_r(3, e, e.return), _l(3, e));
          } catch (O) {
            xe(e, e.return, O);
          }
          try {
            _r(5, e, e.return);
          } catch (O) {
            xe(e, e.return, O);
          }
        }
        break;
      case 1:
        (gt(t, e), kt(e), r & 512 && n !== null && Bn(n, n.return));
        break;
      case 5:
        if (
          (gt(t, e),
          kt(e),
          r & 512 && n !== null && Bn(n, n.return),
          e.flags & 32)
        ) {
          var l = e.stateNode;
          try {
            Qn(l, "");
          } catch (O) {
            xe(e, e.return, O);
          }
        }
        if (r & 4 && ((l = e.stateNode), l != null)) {
          var o = e.memoizedProps,
            i = n !== null ? n.memoizedProps : o,
            u = e.type,
            a = e.updateQueue;
          if (((e.updateQueue = null), a !== null))
            try {
              (u === "input" &&
                o.type === "radio" &&
                o.name != null &&
                Lr(l, o),
                Ql(u, i));
              var g = Ql(u, o);
              for (i = 0; i < a.length; i += 2) {
                var w = a[i],
                  k = a[i + 1];
                w === "style"
                  ? Yi(l, k)
                  : w === "dangerouslySetInnerHTML"
                    ? Hi(l, k)
                    : w === "children"
                      ? Qn(l, k)
                      : ve(l, w, k, g);
              }
              switch (u) {
                case "input":
                  Hn(l, o);
                  break;
                case "textarea":
                  $i(l, o);
                  break;
                case "select":
                  var x = l._wrapperState.wasMultiple;
                  l._wrapperState.wasMultiple = !!o.multiple;
                  var T = o.value;
                  T != null
                    ? Ct(l, !!o.multiple, T, !1)
                    : x !== !!o.multiple &&
                      (o.defaultValue != null
                        ? Ct(l, !!o.multiple, o.defaultValue, !0)
                        : Ct(l, !!o.multiple, o.multiple ? [] : "", !1));
              }
              l[pr] = o;
            } catch (O) {
              xe(e, e.return, O);
            }
        }
        break;
      case 6:
        if ((gt(t, e), kt(e), r & 4)) {
          if (e.stateNode === null) throw Error(d(162));
          ((l = e.stateNode), (o = e.memoizedProps));
          try {
            l.nodeValue = o;
          } catch (O) {
            xe(e, e.return, O);
          }
        }
        break;
      case 3:
        if (
          (gt(t, e), kt(e), r & 4 && n !== null && n.memoizedState.isDehydrated)
        )
          try {
            nr(t.containerInfo);
          } catch (O) {
            xe(e, e.return, O);
          }
        break;
      case 4:
        (gt(t, e), kt(e));
        break;
      case 13:
        (gt(t, e),
          kt(e),
          (l = e.child),
          l.flags & 8192 &&
            ((o = l.memoizedState !== null),
            (l.stateNode.isHidden = o),
            !o ||
              (l.alternate !== null && l.alternate.memoizedState !== null) ||
              (vi = ke())),
          r & 4 && aa(e));
        break;
      case 22:
        if (
          ((w = n !== null && n.memoizedState !== null),
          e.mode & 1 ? (($e = (g = $e) || w), gt(t, e), ($e = g)) : gt(t, e),
          kt(e),
          r & 8192)
        ) {
          if (
            ((g = e.memoizedState !== null),
            (e.stateNode.isHidden = g) && !w && (e.mode & 1) !== 0)
          )
            for (N = e, w = e.child; w !== null; ) {
              for (k = N = w; N !== null; ) {
                switch (((x = N), (T = x.child), x.tag)) {
                  case 0:
                  case 11:
                  case 14:
                  case 15:
                    _r(4, x, x.return);
                    break;
                  case 1:
                    Bn(x, x.return);
                    var L = x.stateNode;
                    if (typeof L.componentWillUnmount == "function") {
                      ((r = x), (n = x.return));
                      try {
                        ((t = r),
                          (L.props = t.memoizedProps),
                          (L.state = t.memoizedState),
                          L.componentWillUnmount());
                      } catch (O) {
                        xe(r, n, O);
                      }
                    }
                    break;
                  case 5:
                    Bn(x, x.return);
                    break;
                  case 22:
                    if (x.memoizedState !== null) {
                      pa(k);
                      continue;
                    }
                }
                T !== null ? ((T.return = x), (N = T)) : pa(k);
              }
              w = w.sibling;
            }
          e: for (w = null, k = e; ; ) {
            if (k.tag === 5) {
              if (w === null) {
                w = k;
                try {
                  ((l = k.stateNode),
                    g
                      ? ((o = l.style),
                        typeof o.setProperty == "function"
                          ? o.setProperty("display", "none", "important")
                          : (o.display = "none"))
                      : ((u = k.stateNode),
                        (a = k.memoizedProps.style),
                        (i =
                          a != null && a.hasOwnProperty("display")
                            ? a.display
                            : null),
                        (u.style.display = Qi("display", i))));
                } catch (O) {
                  xe(e, e.return, O);
                }
              }
            } else if (k.tag === 6) {
              if (w === null)
                try {
                  k.stateNode.nodeValue = g ? "" : k.memoizedProps;
                } catch (O) {
                  xe(e, e.return, O);
                }
            } else if (
              ((k.tag !== 22 && k.tag !== 23) ||
                k.memoizedState === null ||
                k === e) &&
              k.child !== null
            ) {
              ((k.child.return = k), (k = k.child));
              continue;
            }
            if (k === e) break e;
            for (; k.sibling === null; ) {
              if (k.return === null || k.return === e) break e;
              (w === k && (w = null), (k = k.return));
            }
            (w === k && (w = null),
              (k.sibling.return = k.return),
              (k = k.sibling));
          }
        }
        break;
      case 19:
        (gt(t, e), kt(e), r & 4 && aa(e));
        break;
      case 21:
        break;
      default:
        (gt(t, e), kt(e));
    }
  }
  function kt(e) {
    var t = e.flags;
    if (t & 2) {
      try {
        e: {
          for (var n = e.return; n !== null; ) {
            if (ia(n)) {
              var r = n;
              break e;
            }
            n = n.return;
          }
          throw Error(d(160));
        }
        switch (r.tag) {
          case 5:
            var l = r.stateNode;
            r.flags & 32 && (Qn(l, ""), (r.flags &= -33));
            var o = ua(e);
            mi(e, o, l);
            break;
          case 3:
          case 4:
            var i = r.stateNode.containerInfo,
              u = ua(e);
            hi(e, u, i);
            break;
          default:
            throw Error(d(161));
        }
      } catch (a) {
        xe(e, e.return, a);
      }
      e.flags &= -3;
    }
    t & 4096 && (e.flags &= -4097);
  }
  function wf(e, t, n) {
    ((N = e), fa(e));
  }
  function fa(e, t, n) {
    for (var r = (e.mode & 1) !== 0; N !== null; ) {
      var l = N,
        o = l.child;
      if (l.tag === 22 && r) {
        var i = l.memoizedState !== null || El;
        if (!i) {
          var u = l.alternate,
            a = (u !== null && u.memoizedState !== null) || $e;
          u = El;
          var g = $e;
          if (((El = i), ($e = a) && !g))
            for (N = l; N !== null; )
              ((i = N),
                (a = i.child),
                i.tag === 22 && i.memoizedState !== null
                  ? ha(l)
                  : a !== null
                    ? ((a.return = i), (N = a))
                    : ha(l));
          for (; o !== null; ) ((N = o), fa(o), (o = o.sibling));
          ((N = l), (El = u), ($e = g));
        }
        da(e);
      } else
        (l.subtreeFlags & 8772) !== 0 && o !== null
          ? ((o.return = l), (N = o))
          : da(e);
    }
  }
  function da(e) {
    for (; N !== null; ) {
      var t = N;
      if ((t.flags & 8772) !== 0) {
        var n = t.alternate;
        try {
          if ((t.flags & 8772) !== 0)
            switch (t.tag) {
              case 0:
              case 11:
              case 15:
                $e || _l(5, t);
                break;
              case 1:
                var r = t.stateNode;
                if (t.flags & 4 && !$e)
                  if (n === null) r.componentDidMount();
                  else {
                    var l =
                      t.elementType === t.type
                        ? n.memoizedProps
                        : ht(t.type, n.memoizedProps);
                    r.componentDidUpdate(
                      l,
                      n.memoizedState,
                      r.__reactInternalSnapshotBeforeUpdate,
                    );
                  }
                var o = t.updateQueue;
                o !== null && ps(t, o, r);
                break;
              case 3:
                var i = t.updateQueue;
                if (i !== null) {
                  if (((n = null), t.child !== null))
                    switch (t.child.tag) {
                      case 5:
                        n = t.child.stateNode;
                        break;
                      case 1:
                        n = t.child.stateNode;
                    }
                  ps(t, i, n);
                }
                break;
              case 5:
                var u = t.stateNode;
                if (n === null && t.flags & 4) {
                  n = u;
                  var a = t.memoizedProps;
                  switch (t.type) {
                    case "button":
                    case "input":
                    case "select":
                    case "textarea":
                      a.autoFocus && n.focus();
                      break;
                    case "img":
                      a.src && (n.src = a.src);
                  }
                }
                break;
              case 6:
                break;
              case 4:
                break;
              case 12:
                break;
              case 13:
                if (t.memoizedState === null) {
                  var g = t.alternate;
                  if (g !== null) {
                    var w = g.memoizedState;
                    if (w !== null) {
                      var k = w.dehydrated;
                      k !== null && nr(k);
                    }
                  }
                }
                break;
              case 19:
              case 17:
              case 21:
              case 22:
              case 23:
              case 25:
                break;
              default:
                throw Error(d(163));
            }
          $e || (t.flags & 512 && pi(t));
        } catch (x) {
          xe(t, t.return, x);
        }
      }
      if (t === e) {
        N = null;
        break;
      }
      if (((n = t.sibling), n !== null)) {
        ((n.return = t.return), (N = n));
        break;
      }
      N = t.return;
    }
  }
  function pa(e) {
    for (; N !== null; ) {
      var t = N;
      if (t === e) {
        N = null;
        break;
      }
      var n = t.sibling;
      if (n !== null) {
        ((n.return = t.return), (N = n));
        break;
      }
      N = t.return;
    }
  }
  function ha(e) {
    for (; N !== null; ) {
      var t = N;
      try {
        switch (t.tag) {
          case 0:
          case 11:
          case 15:
            var n = t.return;
            try {
              _l(4, t);
            } catch (a) {
              xe(t, n, a);
            }
            break;
          case 1:
            var r = t.stateNode;
            if (typeof r.componentDidMount == "function") {
              var l = t.return;
              try {
                r.componentDidMount();
              } catch (a) {
                xe(t, l, a);
              }
            }
            var o = t.return;
            try {
              pi(t);
            } catch (a) {
              xe(t, o, a);
            }
            break;
          case 5:
            var i = t.return;
            try {
              pi(t);
            } catch (a) {
              xe(t, i, a);
            }
        }
      } catch (a) {
        xe(t, t.return, a);
      }
      if (t === e) {
        N = null;
        break;
      }
      var u = t.sibling;
      if (u !== null) {
        ((u.return = t.return), (N = u));
        break;
      }
      N = t.return;
    }
  }
  var kf = Math.ceil,
    Cl = se.ReactCurrentDispatcher,
    gi = se.ReactCurrentOwner,
    ut = se.ReactCurrentBatchConfig,
    re = 0,
    Ne = null,
    Ce = null,
    De = 0,
    nt = 0,
    Un = Wt(0),
    Pe = 0,
    Cr = null,
    cn = 0,
    jl = 0,
    yi = 0,
    jr = null,
    Xe = null,
    vi = 0,
    $n = 1 / 0,
    Ot = null,
    Pl = !1,
    Si = null,
    Kt = null,
    zl = !1,
    Xt = null,
    Tl = 0,
    Pr = 0,
    xi = null,
    Rl = -1,
    Nl = 0;
  function He() {
    return (re & 6) !== 0 ? ke() : Rl !== -1 ? Rl : (Rl = ke());
  }
  function Jt(e) {
    return (e.mode & 1) === 0
      ? 1
      : (re & 2) !== 0 && De !== 0
        ? De & -De
        : lf.transition !== null
          ? (Nl === 0 && (Nl = uu()), Nl)
          : ((e = ue),
            e !== 0 ||
              ((e = window.event), (e = e === void 0 ? 16 : gu(e.type))),
            e);
  }
  function yt(e, t, n, r) {
    if (50 < Pr) throw ((Pr = 0), (xi = null), Error(d(185)));
    (Zn(e, n, r),
      ((re & 2) === 0 || e !== Ne) &&
        (e === Ne && ((re & 2) === 0 && (jl |= n), Pe === 4 && Zt(e, De)),
        Je(e, r),
        n === 1 &&
          re === 0 &&
          (t.mode & 1) === 0 &&
          (($n = ke() + 500), ol && Ht())));
  }
  function Je(e, t) {
    var n = e.callbackNode;
    lc(e, t);
    var r = Ur(e, e === Ne ? De : 0);
    if (r === 0)
      (n !== null && lu(n), (e.callbackNode = null), (e.callbackPriority = 0));
    else if (((t = r & -r), e.callbackPriority !== t)) {
      if ((n != null && lu(n), t === 1))
        (e.tag === 0 ? rf(ga.bind(null, e)) : ts(ga.bind(null, e)),
          bc(function () {
            (re & 6) === 0 && Ht();
          }),
          (n = null));
      else {
        switch (su(r)) {
          case 1:
            n = ql;
            break;
          case 4:
            n = ou;
            break;
          case 16:
            n = Dr;
            break;
          case 536870912:
            n = iu;
            break;
          default:
            n = Dr;
        }
        n = _a(n, ma.bind(null, e));
      }
      ((e.callbackPriority = t), (e.callbackNode = n));
    }
  }
  function ma(e, t) {
    if (((Rl = -1), (Nl = 0), (re & 6) !== 0)) throw Error(d(327));
    var n = e.callbackNode;
    if (Wn() && e.callbackNode !== n) return null;
    var r = Ur(e, e === Ne ? De : 0);
    if (r === 0) return null;
    if ((r & 30) !== 0 || (r & e.expiredLanes) !== 0 || t) t = Ll(e, r);
    else {
      t = r;
      var l = re;
      re |= 2;
      var o = va();
      (Ne !== e || De !== t) && ((Ot = null), ($n = ke() + 500), dn(e, t));
      do
        try {
          Cf();
          break;
        } catch (u) {
          ya(e, u);
        }
      while (!0);
      (Ao(),
        (Cl.current = o),
        (re = l),
        Ce !== null ? (t = 0) : ((Ne = null), (De = 0), (t = Pe)));
    }
    if (t !== 0) {
      if (
        (t === 2 && ((l = bl(e)), l !== 0 && ((r = l), (t = wi(e, l)))),
        t === 1)
      )
        throw ((n = Cr), dn(e, 0), Zt(e, r), Je(e, ke()), n);
      if (t === 6) Zt(e, r);
      else {
        if (
          ((l = e.current.alternate),
          (r & 30) === 0 &&
            !Ef(l) &&
            ((t = Ll(e, r)),
            t === 2 && ((o = bl(e)), o !== 0 && ((r = o), (t = wi(e, o)))),
            t === 1))
        )
          throw ((n = Cr), dn(e, 0), Zt(e, r), Je(e, ke()), n);
        switch (((e.finishedWork = l), (e.finishedLanes = r), t)) {
          case 0:
          case 1:
            throw Error(d(345));
          case 2:
            pn(e, Xe, Ot);
            break;
          case 3:
            if (
              (Zt(e, r),
              (r & 130023424) === r && ((t = vi + 500 - ke()), 10 < t))
            ) {
              if (Ur(e, 0) !== 0) break;
              if (((l = e.suspendedLanes), (l & r) !== r)) {
                (He(), (e.pingedLanes |= e.suspendedLanes & l));
                break;
              }
              e.timeoutHandle = Po(pn.bind(null, e, Xe, Ot), t);
              break;
            }
            pn(e, Xe, Ot);
            break;
          case 4:
            if ((Zt(e, r), (r & 4194240) === r)) break;
            for (t = e.eventTimes, l = -1; 0 < r; ) {
              var i = 31 - ft(r);
              ((o = 1 << i), (i = t[i]), i > l && (l = i), (r &= ~o));
            }
            if (
              ((r = l),
              (r = ke() - r),
              (r =
                (120 > r
                  ? 120
                  : 480 > r
                    ? 480
                    : 1080 > r
                      ? 1080
                      : 1920 > r
                        ? 1920
                        : 3e3 > r
                          ? 3e3
                          : 4320 > r
                            ? 4320
                            : 1960 * kf(r / 1960)) - r),
              10 < r)
            ) {
              e.timeoutHandle = Po(pn.bind(null, e, Xe, Ot), r);
              break;
            }
            pn(e, Xe, Ot);
            break;
          case 5:
            pn(e, Xe, Ot);
            break;
          default:
            throw Error(d(329));
        }
      }
    }
    return (Je(e, ke()), e.callbackNode === n ? ma.bind(null, e) : null);
  }
  function wi(e, t) {
    var n = jr;
    return (
      e.current.memoizedState.isDehydrated && (dn(e, t).flags |= 256),
      (e = Ll(e, t)),
      e !== 2 && ((t = Xe), (Xe = n), t !== null && ki(t)),
      e
    );
  }
  function ki(e) {
    Xe === null ? (Xe = e) : Xe.push.apply(Xe, e);
  }
  function Ef(e) {
    for (var t = e; ; ) {
      if (t.flags & 16384) {
        var n = t.updateQueue;
        if (n !== null && ((n = n.stores), n !== null))
          for (var r = 0; r < n.length; r++) {
            var l = n[r],
              o = l.getSnapshot;
            l = l.value;
            try {
              if (!dt(o(), l)) return !1;
            } catch {
              return !1;
            }
          }
      }
      if (((n = t.child), t.subtreeFlags & 16384 && n !== null))
        ((n.return = t), (t = n));
      else {
        if (t === e) break;
        for (; t.sibling === null; ) {
          if (t.return === null || t.return === e) return !0;
          t = t.return;
        }
        ((t.sibling.return = t.return), (t = t.sibling));
      }
    }
    return !0;
  }
  function Zt(e, t) {
    for (
      t &= ~yi,
        t &= ~jl,
        e.suspendedLanes |= t,
        e.pingedLanes &= ~t,
        e = e.expirationTimes;
      0 < t;
    ) {
      var n = 31 - ft(t),
        r = 1 << n;
      ((e[n] = -1), (t &= ~r));
    }
  }
  function ga(e) {
    if ((re & 6) !== 0) throw Error(d(327));
    Wn();
    var t = Ur(e, 0);
    if ((t & 1) === 0) return (Je(e, ke()), null);
    var n = Ll(e, t);
    if (e.tag !== 0 && n === 2) {
      var r = bl(e);
      r !== 0 && ((t = r), (n = wi(e, r)));
    }
    if (n === 1) throw ((n = Cr), dn(e, 0), Zt(e, t), Je(e, ke()), n);
    if (n === 6) throw Error(d(345));
    return (
      (e.finishedWork = e.current.alternate),
      (e.finishedLanes = t),
      pn(e, Xe, Ot),
      Je(e, ke()),
      null
    );
  }
  function Ei(e, t) {
    var n = re;
    re |= 1;
    try {
      return e(t);
    } finally {
      ((re = n), re === 0 && (($n = ke() + 500), ol && Ht()));
    }
  }
  function fn(e) {
    Xt !== null && Xt.tag === 0 && (re & 6) === 0 && Wn();
    var t = re;
    re |= 1;
    var n = ut.transition,
      r = ue;
    try {
      if (((ut.transition = null), (ue = 1), e)) return e();
    } finally {
      ((ue = r), (ut.transition = n), (re = t), (re & 6) === 0 && Ht());
    }
  }
  function _i() {
    ((nt = Un.current), he(Un));
  }
  function dn(e, t) {
    ((e.finishedWork = null), (e.finishedLanes = 0));
    var n = e.timeoutHandle;
    if ((n !== -1 && ((e.timeoutHandle = -1), qc(n)), Ce !== null))
      for (n = Ce.return; n !== null; ) {
        var r = n;
        switch ((Oo(r), r.tag)) {
          case 1:
            ((r = r.type.childContextTypes), r != null && rl());
            break;
          case 3:
            (Fn(), he(Ye), he(Ae), Yo());
            break;
          case 5:
            Ho(r);
            break;
          case 4:
            Fn();
            break;
          case 13:
            he(ge);
            break;
          case 19:
            he(ge);
            break;
          case 10:
            Bo(r.type._context);
            break;
          case 22:
          case 23:
            _i();
        }
        n = n.return;
      }
    if (
      ((Ne = e),
      (Ce = e = qt(e.current, null)),
      (De = nt = t),
      (Pe = 0),
      (Cr = null),
      (yi = jl = cn = 0),
      (Xe = jr = null),
      un !== null)
    ) {
      for (t = 0; t < un.length; t++)
        if (((n = un[t]), (r = n.interleaved), r !== null)) {
          n.interleaved = null;
          var l = r.next,
            o = n.pending;
          if (o !== null) {
            var i = o.next;
            ((o.next = l), (r.next = i));
          }
          n.pending = r;
        }
      un = null;
    }
    return e;
  }
  function ya(e, t) {
    do {
      var n = Ce;
      try {
        if ((Ao(), (ml.current = Sl), gl)) {
          for (var r = ye.memoizedState; r !== null; ) {
            var l = r.queue;
            (l !== null && (l.pending = null), (r = r.next));
          }
          gl = !1;
        }
        if (
          ((an = 0),
          (Re = je = ye = null),
          (Sr = !1),
          (xr = 0),
          (gi.current = null),
          n === null || n.return === null)
        ) {
          ((Pe = 1), (Cr = t), (Ce = null));
          break;
        }
        e: {
          var o = e,
            i = n.return,
            u = n,
            a = t;
          if (
            ((t = De),
            (u.flags |= 32768),
            a !== null && typeof a == "object" && typeof a.then == "function")
          ) {
            var g = a,
              w = u,
              k = w.tag;
            if ((w.mode & 1) === 0 && (k === 0 || k === 11 || k === 15)) {
              var x = w.alternate;
              x
                ? ((w.updateQueue = x.updateQueue),
                  (w.memoizedState = x.memoizedState),
                  (w.lanes = x.lanes))
                : ((w.updateQueue = null), (w.memoizedState = null));
            }
            var T = Ws(i);
            if (T !== null) {
              ((T.flags &= -257),
                Vs(T, i, u, o, t),
                T.mode & 1 && $s(o, g, t),
                (t = T),
                (a = g));
              var L = t.updateQueue;
              if (L === null) {
                var O = new Set();
                (O.add(a), (t.updateQueue = O));
              } else L.add(a);
              break e;
            } else {
              if ((t & 1) === 0) {
                ($s(o, g, t), Ci());
                break e;
              }
              a = Error(d(426));
            }
          } else if (me && u.mode & 1) {
            var Ee = Ws(i);
            if (Ee !== null) {
              ((Ee.flags & 65536) === 0 && (Ee.flags |= 256),
                Vs(Ee, i, u, o, t),
                Do(An(a, u)));
              break e;
            }
          }
          ((o = a = An(a, u)),
            Pe !== 4 && (Pe = 2),
            jr === null ? (jr = [o]) : jr.push(o),
            (o = i));
          do {
            switch (o.tag) {
              case 3:
                ((o.flags |= 65536), (t &= -t), (o.lanes |= t));
                var p = Bs(o, a, t);
                ds(o, p);
                break e;
              case 1:
                u = a;
                var f = o.type,
                  h = o.stateNode;
                if (
                  (o.flags & 128) === 0 &&
                  (typeof f.getDerivedStateFromError == "function" ||
                    (h !== null &&
                      typeof h.componentDidCatch == "function" &&
                      (Kt === null || !Kt.has(h))))
                ) {
                  ((o.flags |= 65536), (t &= -t), (o.lanes |= t));
                  var E = Us(o, u, t);
                  ds(o, E);
                  break e;
                }
            }
            o = o.return;
          } while (o !== null);
        }
        xa(n);
      } catch (D) {
        ((t = D), Ce === n && n !== null && (Ce = n = n.return));
        continue;
      }
      break;
    } while (!0);
  }
  function va() {
    var e = Cl.current;
    return ((Cl.current = Sl), e === null ? Sl : e);
  }
  function Ci() {
    ((Pe === 0 || Pe === 3 || Pe === 2) && (Pe = 4),
      Ne === null ||
        ((cn & 268435455) === 0 && (jl & 268435455) === 0) ||
        Zt(Ne, De));
  }
  function Ll(e, t) {
    var n = re;
    re |= 2;
    var r = va();
    (Ne !== e || De !== t) && ((Ot = null), dn(e, t));
    do
      try {
        _f();
        break;
      } catch (l) {
        ya(e, l);
      }
    while (!0);
    if ((Ao(), (re = n), (Cl.current = r), Ce !== null)) throw Error(d(261));
    return ((Ne = null), (De = 0), Pe);
  }
  function _f() {
    for (; Ce !== null; ) Sa(Ce);
  }
  function Cf() {
    for (; Ce !== null && !Xa(); ) Sa(Ce);
  }
  function Sa(e) {
    var t = Ea(e.alternate, e, nt);
    ((e.memoizedProps = e.pendingProps),
      t === null ? xa(e) : (Ce = t),
      (gi.current = null));
  }
  function xa(e) {
    var t = e;
    do {
      var n = t.alternate;
      if (((e = t.return), (t.flags & 32768) === 0)) {
        if (((n = yf(n, t, nt)), n !== null)) {
          Ce = n;
          return;
        }
      } else {
        if (((n = vf(n, t)), n !== null)) {
          ((n.flags &= 32767), (Ce = n));
          return;
        }
        if (e !== null)
          ((e.flags |= 32768), (e.subtreeFlags = 0), (e.deletions = null));
        else {
          ((Pe = 6), (Ce = null));
          return;
        }
      }
      if (((t = t.sibling), t !== null)) {
        Ce = t;
        return;
      }
      Ce = t = e;
    } while (t !== null);
    Pe === 0 && (Pe = 5);
  }
  function pn(e, t, n) {
    var r = ue,
      l = ut.transition;
    try {
      ((ut.transition = null), (ue = 1), jf(e, t, n, r));
    } finally {
      ((ut.transition = l), (ue = r));
    }
    return null;
  }
  function jf(e, t, n, r) {
    do Wn();
    while (Xt !== null);
    if ((re & 6) !== 0) throw Error(d(327));
    n = e.finishedWork;
    var l = e.finishedLanes;
    if (n === null) return null;
    if (((e.finishedWork = null), (e.finishedLanes = 0), n === e.current))
      throw Error(d(177));
    ((e.callbackNode = null), (e.callbackPriority = 0));
    var o = n.lanes | n.childLanes;
    if (
      (oc(e, o),
      e === Ne && ((Ce = Ne = null), (De = 0)),
      ((n.subtreeFlags & 2064) === 0 && (n.flags & 2064) === 0) ||
        zl ||
        ((zl = !0),
        _a(Dr, function () {
          return (Wn(), null);
        })),
      (o = (n.flags & 15990) !== 0),
      (n.subtreeFlags & 15990) !== 0 || o)
    ) {
      ((o = ut.transition), (ut.transition = null));
      var i = ue;
      ue = 1;
      var u = re;
      ((re |= 4),
        (gi.current = null),
        xf(e, n),
        ca(n, e),
        Qc(Co),
        (Vr = !!_o),
        (Co = _o = null),
        (e.current = n),
        wf(n),
        Ja(),
        (re = u),
        (ue = i),
        (ut.transition = o));
    } else e.current = n;
    if (
      (zl && ((zl = !1), (Xt = e), (Tl = l)),
      (o = e.pendingLanes),
      o === 0 && (Kt = null),
      ba(n.stateNode),
      Je(e, ke()),
      t !== null)
    )
      for (r = e.onRecoverableError, n = 0; n < t.length; n++)
        ((l = t[n]), r(l.value, { componentStack: l.stack, digest: l.digest }));
    if (Pl) throw ((Pl = !1), (e = Si), (Si = null), e);
    return (
      (Tl & 1) !== 0 && e.tag !== 0 && Wn(),
      (o = e.pendingLanes),
      (o & 1) !== 0 ? (e === xi ? Pr++ : ((Pr = 0), (xi = e))) : (Pr = 0),
      Ht(),
      null
    );
  }
  function Wn() {
    if (Xt !== null) {
      var e = su(Tl),
        t = ut.transition,
        n = ue;
      try {
        if (((ut.transition = null), (ue = 16 > e ? 16 : e), Xt === null))
          var r = !1;
        else {
          if (((e = Xt), (Xt = null), (Tl = 0), (re & 6) !== 0))
            throw Error(d(331));
          var l = re;
          for (re |= 4, N = e.current; N !== null; ) {
            var o = N,
              i = o.child;
            if ((N.flags & 16) !== 0) {
              var u = o.deletions;
              if (u !== null) {
                for (var a = 0; a < u.length; a++) {
                  var g = u[a];
                  for (N = g; N !== null; ) {
                    var w = N;
                    switch (w.tag) {
                      case 0:
                      case 11:
                      case 15:
                        _r(8, w, o);
                    }
                    var k = w.child;
                    if (k !== null) ((k.return = w), (N = k));
                    else
                      for (; N !== null; ) {
                        w = N;
                        var x = w.sibling,
                          T = w.return;
                        if ((oa(w), w === g)) {
                          N = null;
                          break;
                        }
                        if (x !== null) {
                          ((x.return = T), (N = x));
                          break;
                        }
                        N = T;
                      }
                  }
                }
                var L = o.alternate;
                if (L !== null) {
                  var O = L.child;
                  if (O !== null) {
                    L.child = null;
                    do {
                      var Ee = O.sibling;
                      ((O.sibling = null), (O = Ee));
                    } while (O !== null);
                  }
                }
                N = o;
              }
            }
            if ((o.subtreeFlags & 2064) !== 0 && i !== null)
              ((i.return = o), (N = i));
            else
              e: for (; N !== null; ) {
                if (((o = N), (o.flags & 2048) !== 0))
                  switch (o.tag) {
                    case 0:
                    case 11:
                    case 15:
                      _r(9, o, o.return);
                  }
                var p = o.sibling;
                if (p !== null) {
                  ((p.return = o.return), (N = p));
                  break e;
                }
                N = o.return;
              }
          }
          var f = e.current;
          for (N = f; N !== null; ) {
            i = N;
            var h = i.child;
            if ((i.subtreeFlags & 2064) !== 0 && h !== null)
              ((h.return = i), (N = h));
            else
              e: for (i = f; N !== null; ) {
                if (((u = N), (u.flags & 2048) !== 0))
                  try {
                    switch (u.tag) {
                      case 0:
                      case 11:
                      case 15:
                        _l(9, u);
                    }
                  } catch (D) {
                    xe(u, u.return, D);
                  }
                if (u === i) {
                  N = null;
                  break e;
                }
                var E = u.sibling;
                if (E !== null) {
                  ((E.return = u.return), (N = E));
                  break e;
                }
                N = u.return;
              }
          }
          if (
            ((re = l),
            Ht(),
            vt && typeof vt.onPostCommitFiberRoot == "function")
          )
            try {
              vt.onPostCommitFiberRoot(Fr, e);
            } catch {}
          r = !0;
        }
        return r;
      } finally {
        ((ue = n), (ut.transition = t));
      }
    }
    return !1;
  }
  function wa(e, t, n) {
    ((t = An(n, t)),
      (t = Bs(e, t, 1)),
      (e = Yt(e, t, 1)),
      (t = He()),
      e !== null && (Zn(e, 1, t), Je(e, t)));
  }
  function xe(e, t, n) {
    if (e.tag === 3) wa(e, e, n);
    else
      for (; t !== null; ) {
        if (t.tag === 3) {
          wa(t, e, n);
          break;
        } else if (t.tag === 1) {
          var r = t.stateNode;
          if (
            typeof t.type.getDerivedStateFromError == "function" ||
            (typeof r.componentDidCatch == "function" &&
              (Kt === null || !Kt.has(r)))
          ) {
            ((e = An(n, e)),
              (e = Us(t, e, 1)),
              (t = Yt(t, e, 1)),
              (e = He()),
              t !== null && (Zn(t, 1, e), Je(t, e)));
            break;
          }
        }
        t = t.return;
      }
  }
  function Pf(e, t, n) {
    var r = e.pingCache;
    (r !== null && r.delete(t),
      (t = He()),
      (e.pingedLanes |= e.suspendedLanes & n),
      Ne === e &&
        (De & n) === n &&
        (Pe === 4 || (Pe === 3 && (De & 130023424) === De && 500 > ke() - vi)
          ? dn(e, 0)
          : (yi |= n)),
      Je(e, t));
  }
  function ka(e, t) {
    t === 0 &&
      ((e.mode & 1) === 0
        ? (t = 1)
        : ((t = Br), (Br <<= 1), (Br & 130023424) === 0 && (Br = 4194304)));
    var n = He();
    ((e = Rt(e, t)), e !== null && (Zn(e, t, n), Je(e, n)));
  }
  function zf(e) {
    var t = e.memoizedState,
      n = 0;
    (t !== null && (n = t.retryLane), ka(e, n));
  }
  function Tf(e, t) {
    var n = 0;
    switch (e.tag) {
      case 13:
        var r = e.stateNode,
          l = e.memoizedState;
        l !== null && (n = l.retryLane);
        break;
      case 19:
        r = e.stateNode;
        break;
      default:
        throw Error(d(314));
    }
    (r !== null && r.delete(t), ka(e, n));
  }
  var Ea;
  Ea = function (e, t, n) {
    if (e !== null)
      if (e.memoizedProps !== t.pendingProps || Ye.current) Ke = !0;
      else {
        if ((e.lanes & n) === 0 && (t.flags & 128) === 0)
          return ((Ke = !1), gf(e, t, n));
        Ke = (e.flags & 131072) !== 0;
      }
    else ((Ke = !1), me && (t.flags & 1048576) !== 0 && ns(t, ul, t.index));
    switch (((t.lanes = 0), t.tag)) {
      case 2:
        var r = t.type;
        (kl(e, t), (e = t.pendingProps));
        var l = Rn(t, Ae.current);
        (Dn(t, n), (l = Xo(null, t, r, e, l, n)));
        var o = Jo();
        return (
          (t.flags |= 1),
          typeof l == "object" &&
          l !== null &&
          typeof l.render == "function" &&
          l.$$typeof === void 0
            ? ((t.tag = 1),
              (t.memoizedState = null),
              (t.updateQueue = null),
              Ge(r) ? ((o = !0), ll(t)) : (o = !1),
              (t.memoizedState =
                l.state !== null && l.state !== void 0 ? l.state : null),
              Wo(t),
              (l.updater = xl),
              (t.stateNode = l),
              (l._reactInternals = t),
              ni(t, r, e, n),
              (t = ii(null, t, r, !0, o, n)))
            : ((t.tag = 0), me && o && Lo(t), Ve(null, t, l, n), (t = t.child)),
          t
        );
      case 16:
        r = t.elementType;
        e: {
          switch (
            (kl(e, t),
            (e = t.pendingProps),
            (l = r._init),
            (r = l(r._payload)),
            (t.type = r),
            (l = t.tag = Nf(r)),
            (e = ht(r, e)),
            l)
          ) {
            case 0:
              t = oi(null, t, r, e, n);
              break e;
            case 1:
              t = Xs(null, t, r, e, n);
              break e;
            case 11:
              t = Hs(null, t, r, e, n);
              break e;
            case 14:
              t = Qs(null, t, r, ht(r.type, e), n);
              break e;
          }
          throw Error(d(306, r, ""));
        }
        return t;
      case 0:
        return (
          (r = t.type),
          (l = t.pendingProps),
          (l = t.elementType === r ? l : ht(r, l)),
          oi(e, t, r, l, n)
        );
      case 1:
        return (
          (r = t.type),
          (l = t.pendingProps),
          (l = t.elementType === r ? l : ht(r, l)),
          Xs(e, t, r, l, n)
        );
      case 3:
        e: {
          if ((Js(t), e === null)) throw Error(d(387));
          ((r = t.pendingProps),
            (o = t.memoizedState),
            (l = o.element),
            fs(e, t),
            pl(t, r, null, n));
          var i = t.memoizedState;
          if (((r = i.element), o.isDehydrated))
            if (
              ((o = {
                element: r,
                isDehydrated: !1,
                cache: i.cache,
                pendingSuspenseBoundaries: i.pendingSuspenseBoundaries,
                transitions: i.transitions,
              }),
              (t.updateQueue.baseState = o),
              (t.memoizedState = o),
              t.flags & 256)
            ) {
              ((l = An(Error(d(423)), t)), (t = Zs(e, t, r, n, l)));
              break e;
            } else if (r !== l) {
              ((l = An(Error(d(424)), t)), (t = Zs(e, t, r, n, l)));
              break e;
            } else
              for (
                tt = $t(t.stateNode.containerInfo.firstChild),
                  et = t,
                  me = !0,
                  pt = null,
                  n = as(t, null, r, n),
                  t.child = n;
                n;
              )
                ((n.flags = (n.flags & -3) | 4096), (n = n.sibling));
          else {
            if ((On(), r === l)) {
              t = Lt(e, t, n);
              break e;
            }
            Ve(e, t, r, n);
          }
          t = t.child;
        }
        return t;
      case 5:
        return (
          hs(t),
          e === null && Mo(t),
          (r = t.type),
          (l = t.pendingProps),
          (o = e !== null ? e.memoizedProps : null),
          (i = l.children),
          jo(r, l) ? (i = null) : o !== null && jo(r, o) && (t.flags |= 32),
          Ks(e, t),
          Ve(e, t, i, n),
          t.child
        );
      case 6:
        return (e === null && Mo(t), null);
      case 13:
        return qs(e, t, n);
      case 4:
        return (
          Vo(t, t.stateNode.containerInfo),
          (r = t.pendingProps),
          e === null ? (t.child = In(t, null, r, n)) : Ve(e, t, r, n),
          t.child
        );
      case 11:
        return (
          (r = t.type),
          (l = t.pendingProps),
          (l = t.elementType === r ? l : ht(r, l)),
          Hs(e, t, r, l, n)
        );
      case 7:
        return (Ve(e, t, t.pendingProps, n), t.child);
      case 8:
        return (Ve(e, t, t.pendingProps.children, n), t.child);
      case 12:
        return (Ve(e, t, t.pendingProps.children, n), t.child);
      case 10:
        e: {
          if (
            ((r = t.type._context),
            (l = t.pendingProps),
            (o = t.memoizedProps),
            (i = l.value),
            fe(cl, r._currentValue),
            (r._currentValue = i),
            o !== null)
          )
            if (dt(o.value, i)) {
              if (o.children === l.children && !Ye.current) {
                t = Lt(e, t, n);
                break e;
              }
            } else
              for (o = t.child, o !== null && (o.return = t); o !== null; ) {
                var u = o.dependencies;
                if (u !== null) {
                  i = o.child;
                  for (var a = u.firstContext; a !== null; ) {
                    if (a.context === r) {
                      if (o.tag === 1) {
                        ((a = Nt(-1, n & -n)), (a.tag = 2));
                        var g = o.updateQueue;
                        if (g !== null) {
                          g = g.shared;
                          var w = g.pending;
                          (w === null
                            ? (a.next = a)
                            : ((a.next = w.next), (w.next = a)),
                            (g.pending = a));
                        }
                      }
                      ((o.lanes |= n),
                        (a = o.alternate),
                        a !== null && (a.lanes |= n),
                        Uo(o.return, n, t),
                        (u.lanes |= n));
                      break;
                    }
                    a = a.next;
                  }
                } else if (o.tag === 10) i = o.type === t.type ? null : o.child;
                else if (o.tag === 18) {
                  if (((i = o.return), i === null)) throw Error(d(341));
                  ((i.lanes |= n),
                    (u = i.alternate),
                    u !== null && (u.lanes |= n),
                    Uo(i, n, t),
                    (i = o.sibling));
                } else i = o.child;
                if (i !== null) i.return = o;
                else
                  for (i = o; i !== null; ) {
                    if (i === t) {
                      i = null;
                      break;
                    }
                    if (((o = i.sibling), o !== null)) {
                      ((o.return = i.return), (i = o));
                      break;
                    }
                    i = i.return;
                  }
                o = i;
              }
          (Ve(e, t, l.children, n), (t = t.child));
        }
        return t;
      case 9:
        return (
          (l = t.type),
          (r = t.pendingProps.children),
          Dn(t, n),
          (l = ot(l)),
          (r = r(l)),
          (t.flags |= 1),
          Ve(e, t, r, n),
          t.child
        );
      case 14:
        return (
          (r = t.type),
          (l = ht(r, t.pendingProps)),
          (l = ht(r.type, l)),
          Qs(e, t, r, l, n)
        );
      case 15:
        return Ys(e, t, t.type, t.pendingProps, n);
      case 17:
        return (
          (r = t.type),
          (l = t.pendingProps),
          (l = t.elementType === r ? l : ht(r, l)),
          kl(e, t),
          (t.tag = 1),
          Ge(r) ? ((e = !0), ll(t)) : (e = !1),
          Dn(t, n),
          Fs(t, r, l),
          ni(t, r, l, n),
          ii(null, t, r, !0, e, n)
        );
      case 19:
        return ea(e, t, n);
      case 22:
        return Gs(e, t, n);
    }
    throw Error(d(156, t.tag));
  };
  function _a(e, t) {
    return ru(e, t);
  }
  function Rf(e, t, n, r) {
    ((this.tag = e),
      (this.key = n),
      (this.sibling =
        this.child =
        this.return =
        this.stateNode =
        this.type =
        this.elementType =
          null),
      (this.index = 0),
      (this.ref = null),
      (this.pendingProps = t),
      (this.dependencies =
        this.memoizedState =
        this.updateQueue =
        this.memoizedProps =
          null),
      (this.mode = r),
      (this.subtreeFlags = this.flags = 0),
      (this.deletions = null),
      (this.childLanes = this.lanes = 0),
      (this.alternate = null));
  }
  function st(e, t, n, r) {
    return new Rf(e, t, n, r);
  }
  function ji(e) {
    return ((e = e.prototype), !(!e || !e.isReactComponent));
  }
  function Nf(e) {
    if (typeof e == "function") return ji(e) ? 1 : 0;
    if (e != null) {
      if (((e = e.$$typeof), e === Qe)) return 11;
      if (e === ee) return 14;
    }
    return 2;
  }
  function qt(e, t) {
    var n = e.alternate;
    return (
      n === null
        ? ((n = st(e.tag, t, e.key, e.mode)),
          (n.elementType = e.elementType),
          (n.type = e.type),
          (n.stateNode = e.stateNode),
          (n.alternate = e),
          (e.alternate = n))
        : ((n.pendingProps = t),
          (n.type = e.type),
          (n.flags = 0),
          (n.subtreeFlags = 0),
          (n.deletions = null)),
      (n.flags = e.flags & 14680064),
      (n.childLanes = e.childLanes),
      (n.lanes = e.lanes),
      (n.child = e.child),
      (n.memoizedProps = e.memoizedProps),
      (n.memoizedState = e.memoizedState),
      (n.updateQueue = e.updateQueue),
      (t = e.dependencies),
      (n.dependencies =
        t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }),
      (n.sibling = e.sibling),
      (n.index = e.index),
      (n.ref = e.ref),
      n
    );
  }
  function Ol(e, t, n, r, l, o) {
    var i = 2;
    if (((r = e), typeof e == "function")) ji(e) && (i = 1);
    else if (typeof e == "string") i = 5;
    else
      e: switch (e) {
        case ce:
          return hn(n.children, l, o, t);
        case Se:
          ((i = 8), (l |= 8));
          break;
        case Te:
          return (
            (e = st(12, n, t, l | 2)),
            (e.elementType = Te),
            (e.lanes = o),
            e
          );
        case Ie:
          return (
            (e = st(13, n, t, l)),
            (e.elementType = Ie),
            (e.lanes = o),
            e
          );
        case G:
          return ((e = st(19, n, t, l)), (e.elementType = G), (e.lanes = o), e);
        case ie:
          return Il(n, l, o, t);
        default:
          if (typeof e == "object" && e !== null)
            switch (e.$$typeof) {
              case Fe:
                i = 10;
                break e;
              case ct:
                i = 9;
                break e;
              case Qe:
                i = 11;
                break e;
              case ee:
                i = 14;
                break e;
              case de:
                ((i = 16), (r = null));
                break e;
            }
          throw Error(d(130, e == null ? e : typeof e, ""));
      }
    return (
      (t = st(i, n, t, l)),
      (t.elementType = e),
      (t.type = r),
      (t.lanes = o),
      t
    );
  }
  function hn(e, t, n, r) {
    return ((e = st(7, e, r, t)), (e.lanes = n), e);
  }
  function Il(e, t, n, r) {
    return (
      (e = st(22, e, r, t)),
      (e.elementType = ie),
      (e.lanes = n),
      (e.stateNode = { isHidden: !1 }),
      e
    );
  }
  function Pi(e, t, n) {
    return ((e = st(6, e, null, t)), (e.lanes = n), e);
  }
  function zi(e, t, n) {
    return (
      (t = st(4, e.children !== null ? e.children : [], e.key, t)),
      (t.lanes = n),
      (t.stateNode = {
        containerInfo: e.containerInfo,
        pendingChildren: null,
        implementation: e.implementation,
      }),
      t
    );
  }
  function Lf(e, t, n, r, l) {
    ((this.tag = t),
      (this.containerInfo = e),
      (this.finishedWork =
        this.pingCache =
        this.current =
        this.pendingChildren =
          null),
      (this.timeoutHandle = -1),
      (this.callbackNode = this.pendingContext = this.context = null),
      (this.callbackPriority = 0),
      (this.eventTimes = eo(0)),
      (this.expirationTimes = eo(-1)),
      (this.entangledLanes =
        this.finishedLanes =
        this.mutableReadLanes =
        this.expiredLanes =
        this.pingedLanes =
        this.suspendedLanes =
        this.pendingLanes =
          0),
      (this.entanglements = eo(0)),
      (this.identifierPrefix = r),
      (this.onRecoverableError = l),
      (this.mutableSourceEagerHydrationData = null));
  }
  function Ti(e, t, n, r, l, o, i, u, a) {
    return (
      (e = new Lf(e, t, n, u, a)),
      t === 1 ? ((t = 1), o === !0 && (t |= 8)) : (t = 0),
      (o = st(3, null, null, t)),
      (e.current = o),
      (o.stateNode = e),
      (o.memoizedState = {
        element: r,
        isDehydrated: n,
        cache: null,
        transitions: null,
        pendingSuspenseBoundaries: null,
      }),
      Wo(o),
      e
    );
  }
  function Of(e, t, n) {
    var r =
      3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: Z,
      key: r == null ? null : "" + r,
      children: e,
      containerInfo: t,
      implementation: n,
    };
  }
  function Ca(e) {
    if (!e) return Vt;
    e = e._reactInternals;
    e: {
      if (tn(e) !== e || e.tag !== 1) throw Error(d(170));
      var t = e;
      do {
        switch (t.tag) {
          case 3:
            t = t.stateNode.context;
            break e;
          case 1:
            if (Ge(t.type)) {
              t = t.stateNode.__reactInternalMemoizedMergedChildContext;
              break e;
            }
        }
        t = t.return;
      } while (t !== null);
      throw Error(d(171));
    }
    if (e.tag === 1) {
      var n = e.type;
      if (Ge(n)) return bu(e, n, t);
    }
    return t;
  }
  function ja(e, t, n, r, l, o, i, u, a) {
    return (
      (e = Ti(n, r, !0, e, l, o, i, u, a)),
      (e.context = Ca(null)),
      (n = e.current),
      (r = He()),
      (l = Jt(n)),
      (o = Nt(r, l)),
      (o.callback = t ?? null),
      Yt(n, o, l),
      (e.current.lanes = l),
      Zn(e, l, r),
      Je(e, r),
      e
    );
  }
  function Ml(e, t, n, r) {
    var l = t.current,
      o = He(),
      i = Jt(l);
    return (
      (n = Ca(n)),
      t.context === null ? (t.context = n) : (t.pendingContext = n),
      (t = Nt(o, i)),
      (t.payload = { element: e }),
      (r = r === void 0 ? null : r),
      r !== null && (t.callback = r),
      (e = Yt(l, t, i)),
      e !== null && (yt(e, l, i, o), dl(e, l, i)),
      i
    );
  }
  function Dl(e) {
    if (((e = e.current), !e.child)) return null;
    switch (e.child.tag) {
      case 5:
        return e.child.stateNode;
      default:
        return e.child.stateNode;
    }
  }
  function Pa(e, t) {
    if (((e = e.memoizedState), e !== null && e.dehydrated !== null)) {
      var n = e.retryLane;
      e.retryLane = n !== 0 && n < t ? n : t;
    }
  }
  function Ri(e, t) {
    (Pa(e, t), (e = e.alternate) && Pa(e, t));
  }
  function If() {
    return null;
  }
  var za =
    typeof reportError == "function"
      ? reportError
      : function (e) {
          console.error(e);
        };
  function Ni(e) {
    this._internalRoot = e;
  }
  ((Fl.prototype.render = Ni.prototype.render =
    function (e) {
      var t = this._internalRoot;
      if (t === null) throw Error(d(409));
      Ml(e, t, null, null);
    }),
    (Fl.prototype.unmount = Ni.prototype.unmount =
      function () {
        var e = this._internalRoot;
        if (e !== null) {
          this._internalRoot = null;
          var t = e.containerInfo;
          (fn(function () {
            Ml(null, e, null, null);
          }),
            (t[jt] = null));
        }
      }));
  function Fl(e) {
    this._internalRoot = e;
  }
  Fl.prototype.unstable_scheduleHydration = function (e) {
    if (e) {
      var t = fu();
      e = { blockedOn: null, target: e, priority: t };
      for (var n = 0; n < At.length && t !== 0 && t < At[n].priority; n++);
      (At.splice(n, 0, e), n === 0 && hu(e));
    }
  };
  function Li(e) {
    return !(!e || (e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11));
  }
  function Al(e) {
    return !(
      !e ||
      (e.nodeType !== 1 &&
        e.nodeType !== 9 &&
        e.nodeType !== 11 &&
        (e.nodeType !== 8 || e.nodeValue !== " react-mount-point-unstable "))
    );
  }
  function Ta() {}
  function Mf(e, t, n, r, l) {
    if (l) {
      if (typeof r == "function") {
        var o = r;
        r = function () {
          var g = Dl(i);
          o.call(g);
        };
      }
      var i = ja(t, r, e, 0, null, !1, !1, "", Ta);
      return (
        (e._reactRootContainer = i),
        (e[jt] = i.current),
        fr(e.nodeType === 8 ? e.parentNode : e),
        fn(),
        i
      );
    }
    for (; (l = e.lastChild); ) e.removeChild(l);
    if (typeof r == "function") {
      var u = r;
      r = function () {
        var g = Dl(a);
        u.call(g);
      };
    }
    var a = Ti(e, 0, !1, null, null, !1, !1, "", Ta);
    return (
      (e._reactRootContainer = a),
      (e[jt] = a.current),
      fr(e.nodeType === 8 ? e.parentNode : e),
      fn(function () {
        Ml(t, a, n, r);
      }),
      a
    );
  }
  function Bl(e, t, n, r, l) {
    var o = n._reactRootContainer;
    if (o) {
      var i = o;
      if (typeof l == "function") {
        var u = l;
        l = function () {
          var a = Dl(i);
          u.call(a);
        };
      }
      Ml(t, i, e, l);
    } else i = Mf(n, t, e, l, r);
    return Dl(i);
  }
  ((au = function (e) {
    switch (e.tag) {
      case 3:
        var t = e.stateNode;
        if (t.current.memoizedState.isDehydrated) {
          var n = Jn(t.pendingLanes);
          n !== 0 &&
            (to(t, n | 1),
            Je(t, ke()),
            (re & 6) === 0 && (($n = ke() + 500), Ht()));
        }
        break;
      case 13:
        (fn(function () {
          var r = Rt(e, 1);
          if (r !== null) {
            var l = He();
            yt(r, e, 1, l);
          }
        }),
          Ri(e, 1));
    }
  }),
    (no = function (e) {
      if (e.tag === 13) {
        var t = Rt(e, 134217728);
        if (t !== null) {
          var n = He();
          yt(t, e, 134217728, n);
        }
        Ri(e, 134217728);
      }
    }),
    (cu = function (e) {
      if (e.tag === 13) {
        var t = Jt(e),
          n = Rt(e, t);
        if (n !== null) {
          var r = He();
          yt(n, e, t, r);
        }
        Ri(e, t);
      }
    }),
    (fu = function () {
      return ue;
    }),
    (du = function (e, t) {
      var n = ue;
      try {
        return ((ue = e), t());
      } finally {
        ue = n;
      }
    }),
    (Kl = function (e, t, n) {
      switch (t) {
        case "input":
          if ((Hn(e, n), (t = n.name), n.type === "radio" && t != null)) {
            for (n = e; n.parentNode; ) n = n.parentNode;
            for (
              n = n.querySelectorAll(
                "input[name=" + JSON.stringify("" + t) + '][type="radio"]',
              ),
                t = 0;
              t < n.length;
              t++
            ) {
              var r = n[t];
              if (r !== e && r.form === e.form) {
                var l = nl(r);
                if (!l) throw Error(d(90));
                (_t(r), Hn(r, l));
              }
            }
          }
          break;
        case "textarea":
          $i(e, n);
          break;
        case "select":
          ((t = n.value), t != null && Ct(e, !!n.multiple, t, !1));
      }
    }),
    (Ji = Ei),
    (Zi = fn));
  var Df = { usingClientEntryPoint: !1, Events: [hr, zn, nl, Ki, Xi, Ei] },
    zr = {
      findFiberByHostInstance: nn,
      bundleType: 0,
      version: "18.3.1",
      rendererPackageName: "react-dom",
    },
    Ff = {
      bundleType: zr.bundleType,
      version: zr.version,
      rendererPackageName: zr.rendererPackageName,
      rendererConfig: zr.rendererConfig,
      overrideHookState: null,
      overrideHookStateDeletePath: null,
      overrideHookStateRenamePath: null,
      overrideProps: null,
      overridePropsDeletePath: null,
      overridePropsRenamePath: null,
      setErrorHandler: null,
      setSuspenseHandler: null,
      scheduleUpdate: null,
      currentDispatcherRef: se.ReactCurrentDispatcher,
      findHostInstanceByFiber: function (e) {
        return ((e = tu(e)), e === null ? null : e.stateNode);
      },
      findFiberByHostInstance: zr.findFiberByHostInstance || If,
      findHostInstancesForRefresh: null,
      scheduleRefresh: null,
      scheduleRoot: null,
      setRefreshHandler: null,
      getCurrentFiber: null,
      reconcilerVersion: "18.3.1-next-f1338f8080-20240426",
    };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var Ul = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!Ul.isDisabled && Ul.supportsFiber)
      try {
        ((Fr = Ul.inject(Ff)), (vt = Ul));
      } catch {}
  }
  return (
    (Ze.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = Df),
    (Ze.createPortal = function (e, t) {
      var n =
        2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
      if (!Li(t)) throw Error(d(200));
      return Of(e, t, null, n);
    }),
    (Ze.createRoot = function (e, t) {
      if (!Li(e)) throw Error(d(299));
      var n = !1,
        r = "",
        l = za;
      return (
        t != null &&
          (t.unstable_strictMode === !0 && (n = !0),
          t.identifierPrefix !== void 0 && (r = t.identifierPrefix),
          t.onRecoverableError !== void 0 && (l = t.onRecoverableError)),
        (t = Ti(e, 1, !1, null, null, n, !1, r, l)),
        (e[jt] = t.current),
        fr(e.nodeType === 8 ? e.parentNode : e),
        new Ni(t)
      );
    }),
    (Ze.findDOMNode = function (e) {
      if (e == null) return null;
      if (e.nodeType === 1) return e;
      var t = e._reactInternals;
      if (t === void 0)
        throw typeof e.render == "function"
          ? Error(d(188))
          : ((e = Object.keys(e).join(",")), Error(d(268, e)));
      return ((e = tu(t)), (e = e === null ? null : e.stateNode), e);
    }),
    (Ze.flushSync = function (e) {
      return fn(e);
    }),
    (Ze.hydrate = function (e, t, n) {
      if (!Al(t)) throw Error(d(200));
      return Bl(null, e, t, !0, n);
    }),
    (Ze.hydrateRoot = function (e, t, n) {
      if (!Li(e)) throw Error(d(405));
      var r = (n != null && n.hydratedSources) || null,
        l = !1,
        o = "",
        i = za;
      if (
        (n != null &&
          (n.unstable_strictMode === !0 && (l = !0),
          n.identifierPrefix !== void 0 && (o = n.identifierPrefix),
          n.onRecoverableError !== void 0 && (i = n.onRecoverableError)),
        (t = ja(t, null, e, 1, n ?? null, l, !1, o, i)),
        (e[jt] = t.current),
        fr(e),
        r)
      )
        for (e = 0; e < r.length; e++)
          ((n = r[e]),
            (l = n._getVersion),
            (l = l(n._source)),
            t.mutableSourceEagerHydrationData == null
              ? (t.mutableSourceEagerHydrationData = [n, l])
              : t.mutableSourceEagerHydrationData.push(n, l));
      return new Fl(t);
    }),
    (Ze.render = function (e, t, n) {
      if (!Al(t)) throw Error(d(200));
      return Bl(null, e, t, !1, n);
    }),
    (Ze.unmountComponentAtNode = function (e) {
      if (!Al(e)) throw Error(d(40));
      return e._reactRootContainer
        ? (fn(function () {
            Bl(null, null, e, !1, function () {
              ((e._reactRootContainer = null), (e[jt] = null));
            });
          }),
          !0)
        : !1;
    }),
    (Ze.unstable_batchedUpdates = Ei),
    (Ze.unstable_renderSubtreeIntoContainer = function (e, t, n, r) {
      if (!Al(n)) throw Error(d(200));
      if (e == null || e._reactInternals === void 0) throw Error(d(38));
      return Bl(e, t, n, !1, r);
    }),
    (Ze.version = "18.3.1-next-f1338f8080-20240426"),
    Ze
  );
}
var Fa;
function Qf() {
  if (Fa) return Mi.exports;
  Fa = 1;
  function y() {
    if (
      !(
        typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" ||
        typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"
      )
    )
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(y);
      } catch (S) {
        console.error(S);
      }
  }
  return (y(), (Mi.exports = Hf()), Mi.exports);
}
var Aa;
function Yf() {
  if (Aa) return $l;
  Aa = 1;
  var y = Qf();
  return (($l.createRoot = y.createRoot), ($l.hydrateRoot = y.hydrateRoot), $l);
}
var Gf = Yf();
const at = ["QB", "WR", "RB", "TE"],
  Kf = { QB: 0.18, RB: 0.35, WR: 0.35, TE: 0.12 },
  Ua = {
    Cornerstone: { color: "#FFD700", short: "CS" },
    Foundational: { color: "#00f5a0", short: "FD" },
    "Productive Vet": { color: "#7fff7f", short: "PV" },
    Mainstay: { color: "#64b5f6", short: "MS" },
    "Upside Shot": { color: "#c084fc", short: "UP" },
    "Short Term League Winner": { color: "#ff9800", short: "LW" },
    "Short Term Production": { color: "#ffd84d", short: "ST" },
    Serviceable: { color: "#d9deef", short: "SV" },
    "JAG - Insurance": { color: "#d1d7ea", short: "JI" },
    "JAG - Developmental": { color: "#9b7fd4", short: "JD" },
    Replaceable: { color: "#ff2d55", short: "RP" },
  },
  Xf = {
    Cornerstone:
      "Proven elite production with high insulation. Unlikely to lose value even after a bad season.",
    Foundational:
      "At or near prime, highly insulated, undetermined ceiling. High floor and high upside.",
    "Productive Vet":
      "Older but in a good situation with years of proven start-worthy production ahead.",
    Mainstay:
      "Young version of Productive Vet — consistent role and output, not yet elite.",
    "Upside Shot":
      "Young with insulation but ceiling unrealized. Breakout potential via development or situation change.",
    "Short Term League Winner":
      "Aging but elite producer. High production floor, low dynasty insulation — play for now.",
    "Short Term Production":
      "Currently producing but significant questions about sustainability beyond this season.",
    Serviceable:
      "Name value, consistent flex role, capped ceiling. Reliable bench filler.",
    "JAG - Insurance":
      "Bench insurance. Limited production, not a weekly starter — just a number.",
    "JAG - Developmental":
      "Young with little production yet. Pure development prospect, hold and wait.",
    Replaceable:
      "Droppable. Low FAAB cost to replace, not rostered in every league.",
  },
  Y = {
    app: {
      minHeight: "100vh",
      background: "#141722",
      color: "#e8e8f0",
      position: "relative",
      overflow: "hidden",
    },
    grid: {
      position: "fixed",
      inset: 0,
      backgroundImage:
        "linear-gradient(rgba(0,245,160,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,160,0.045) 1px, transparent 1px)",
      backgroundSize: "40px 40px",
      pointerEvents: "none",
      zIndex: 0,
    },
    content: {
      position: "relative",
      zIndex: 1,
      maxWidth: 960,
      margin: "0 auto",
      padding: "48px 24px 80px",
    },
    header: {
      marginBottom: 36,
      borderBottom: "1px solid rgba(0,245,160,0.15)",
      paddingBottom: 24,
    },
    logo: {
      fontSize: 10,
      letterSpacing: 5,
      color: "#00f5a0",
      textTransform: "uppercase",
      marginBottom: 10,
      opacity: 0.6,
    },
    title: {
      fontSize: 28,
      fontWeight: 700,
      color: "#fff",
      letterSpacing: -0.5,
      lineHeight: 1.2,
    },
    subtitle: {
      fontSize: 12,
      color: "#d7dcef",
      marginTop: 6,
      letterSpacing: 0.5,
    },
    input: {
      background: "rgba(0,245,160,0.04)",
      border: "1px solid rgba(0,245,160,0.18)",
      color: "#e8e8f0",
      padding: "13px 18px",
      fontSize: 15,
      width: "100%",
      borderRadius: 3,
      transition: "border-color 0.15s, box-shadow 0.15s",
    },
    btn: {
      background: "#00f5a0",
      color: "#050508",
      border: "none",
      padding: "13px 28px",
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 2.5,
      textTransform: "uppercase",
      borderRadius: 3,
    },
    btnOutline: {
      background: "transparent",
      color: "#00f5a0",
      border: "1px solid rgba(0,245,160,0.3)",
      padding: "12px 18px",
      fontSize: 12,
      letterSpacing: 1.5,
      textTransform: "uppercase",
      borderRadius: 3,
      width: "100%",
      textAlign: "left",
      marginBottom: 6,
    },
    btnGhost: {
      background: "transparent",
      color: "#eef1ff",
      border: "1px solid rgba(255,255,255,0.24)",
      padding: "7px 14px",
      fontSize: 10,
      letterSpacing: 2,
      textTransform: "uppercase",
      borderRadius: 3,
    },
    card: {
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.15)",
      padding: "18px 22px",
      borderRadius: 5,
      marginBottom: 12,
    },
    tag: (y) => ({
      display: "inline-block",
      padding: "3px 9px",
      borderRadius: 2,
      fontSize: 9,
      letterSpacing: 1.5,
      fontWeight: 700,
      textTransform: "uppercase",
      background: `${y}1a`,
      color: y,
      border: `1px solid ${y}40`,
      whiteSpace: "nowrap",
    }),
    tab: (y) => ({
      padding: "10px 18px",
      fontSize: 10,
      letterSpacing: 2,
      textTransform: "uppercase",
      border: "none",
      background: "transparent",
      color: y ? "#00f5a0" : "#c3c9dd",
      borderBottom: y ? "2px solid #00f5a0" : "2px solid transparent",
    }),
    playerRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 0",
      borderBottom: "1px solid rgba(255,255,255,0.1)",
    },
    sectionLabel: {
      fontSize: 9,
      letterSpacing: 3.5,
      color: "#00f5a0",
      textTransform: "uppercase",
      marginBottom: 14,
      opacity: 0.75,
    },
  };
function Jf({ onClose: y }) {
  return c.jsx("div", {
    onClick: y,
    className: "dyn-modal-backdrop",
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.75)",
      zIndex: 100,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    children: c.jsxs("div", {
      onClick: (S) => S.stopPropagation(),
      className: "dyn-modal",
      style: {
        background: "#0d0d16",
        border: "1px solid rgba(0,245,160,0.18)",
        borderRadius: 6,
        padding: 32,
        maxWidth: 520,
        width: "90%",
        position: "relative",
        maxHeight: "88vh",
        overflowY: "auto",
      },
      children: [
        c.jsx("button", {
          onClick: y,
          style: {
            position: "absolute",
            top: 16,
            right: 16,
            background: "transparent",
            border: "none",
            color: "#d1d7ea",
            fontSize: 18,
            cursor: "pointer",
            lineHeight: 1,
          },
          children: "✕",
        }),
        c.jsx("div", {
          style: {
            fontSize: 10,
            letterSpacing: 4,
            color: "#00f5a0",
            textTransform: "uppercase",
            marginBottom: 20,
          },
          children: "Grade Key",
        }),
        c.jsx("div", {
          style: {
            fontSize: 11,
            letterSpacing: 3,
            color: "#fff",
            textTransform: "uppercase",
            marginBottom: 10,
          },
          children: "Position Room Grades",
        }),
        [
          {
            grade: "A",
            color: "#00f5a0",
            label: "Elite Core",
            desc: "50%+ buy verdicts, avg score ≥ 70",
          },
          {
            grade: "B",
            color: "#7fff7f",
            label: "Good Shape",
            desc: "30%+ buy verdicts, avg score ≥ 58",
          },
          {
            grade: "C",
            color: "#ffd84d",
            label: "Mixed Bag",
            desc: "Avg score ≥ 45, some young talent",
          },
          {
            grade: "D",
            color: "#ff6b35",
            label: "Needs Work",
            desc: "Avg score below 45, aging or thin",
          },
          {
            grade: "F",
            color: "#ff2d55",
            label: "Empty",
            desc: "No rostered players at this position",
          },
        ].map(({ grade: S, color: d, label: R, desc: C }) =>
          c.jsxs(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                marginBottom: 10,
              },
              children: [
                c.jsx("div", {
                  style: {
                    width: 28,
                    height: 28,
                    flexShrink: 0,
                    borderRadius: 3,
                    background: `${d}18`,
                    border: `1px solid ${d}55`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: 14,
                    color: d,
                  },
                  children: S,
                }),
                c.jsxs("div", {
                  children: [
                    c.jsx("div", {
                      style: { fontSize: 12, color: "#e8e8f0" },
                      children: R,
                    }),
                    c.jsx("div", {
                      style: { fontSize: 11, color: "#d1d7ea", marginTop: 2 },
                      children: C,
                    }),
                  ],
                }),
              ],
            },
            S,
          ),
        ),
        c.jsx("div", {
          style: {
            height: 1,
            background: "rgba(255,255,255,0.06)",
            margin: "20px 0",
          },
        }),
        c.jsx("div", {
          style: {
            fontSize: 11,
            letterSpacing: 3,
            color: "#fff",
            textTransform: "uppercase",
            marginBottom: 10,
          },
          children: "Player Verdicts (composite 0–100)",
        }),
        [
          {
            verdict: "buy",
            color: "#00f5a0",
            range: "≥ 72",
            desc: "Young, producing, healthy — priority to keep or acquire",
          },
          {
            verdict: "hold",
            color: "#ffd84d",
            range: "52–71",
            desc: "Solid contributor but some concern — monitor before trading",
          },
          {
            verdict: "sell",
            color: "#ff6b35",
            range: "35–51",
            desc: "Aging or declining — explore trade value now",
          },
          {
            verdict: "cut",
            color: "#ff2d55",
            range: "< 35",
            desc: "Low dynasty value — move on or use as trade throw-in",
          },
        ].map(({ verdict: S, color: d, range: R, desc: C }) =>
          c.jsxs(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                marginBottom: 10,
              },
              children: [
                c.jsx("div", {
                  style: {
                    padding: "3px 10px",
                    borderRadius: 2,
                    fontSize: 10,
                    letterSpacing: 2,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    background: `${d}22`,
                    color: d,
                    border: `1px solid ${d}44`,
                    flexShrink: 0,
                    alignSelf: "flex-start",
                  },
                  children: S,
                }),
                c.jsxs("div", {
                  children: [
                    c.jsx("div", {
                      style: { fontSize: 11, color: "#fff" },
                      children: R,
                    }),
                    c.jsx("div", {
                      style: { fontSize: 11, color: "#fff", marginTop: 2 },
                      children: C,
                    }),
                  ],
                }),
              ],
            },
            S,
          ),
        ),
        c.jsx("div", {
          style: {
            height: 1,
            background: "rgba(255,255,255,0.06)",
            margin: "20px 0",
          },
        }),
        c.jsx("div", {
          style: {
            fontSize: 11,
            letterSpacing: 3,
            color: "#fff",
            textTransform: "uppercase",
            marginBottom: 10,
          },
          children: "Player Archetypes",
        }),
        Object.entries(Ua).map(([S, { color: d }]) =>
          c.jsxs(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                marginBottom: 9,
              },
              children: [
                c.jsx("span", {
                  style: {
                    ...Y.tag(d),
                    fontSize: 8,
                    flexShrink: 0,
                    alignSelf: "flex-start",
                    marginTop: 1,
                  },
                  children: S,
                }),
                c.jsx("div", {
                  style: { fontSize: 11, color: "#d1d7ea", lineHeight: 1.4 },
                  children: Xf[S],
                }),
              ],
            },
            S,
          ),
        ),
        c.jsx("div", {
          style: {
            height: 1,
            background: "rgba(255,255,255,0.06)",
            margin: "20px 0",
          },
        }),
        c.jsx("div", {
          style: {
            fontSize: 11,
            letterSpacing: 3,
            color: "#fff",
            textTransform: "uppercase",
            marginBottom: 10,
          },
          children: "Score Components",
        }),
        [
          {
            label: "Age",
            color: "#7b8cff",
            pct: "35%",
            desc: "Dynasty  runway — position-adjusted peak/decline curves",
          },
          {
            label: "Production",
            color: "#00f5a0",
            pct: "30%",
            desc: "2024 PPR pts/game vs elite positional threshold",
          },
          {
            label: "Avail",
            color: "#ffd84d",
            pct: "15%",
            desc: "Games played out of 17 + injury status penalty",
          },
          {
            label: "Trend",
            color: "#ff6b35",
            pct: "10%",
            desc: "2024 vs 2023 PPG — rising or declining production",
          },
          {
            label: "Situation",
            color: "#c084fc",
            pct: "10%",
            desc: "Depth chart starter status and team/FA situation",
          },
        ].map(({ label: S, color: d, pct: R, desc: C }) =>
          c.jsxs(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                marginBottom: 8,
              },
              children: [
                c.jsx("div", {
                  style: {
                    width: 28,
                    flexShrink: 0,
                    fontSize: 10,
                    color: d,
                    fontWeight: 700,
                    paddingTop: 2,
                  },
                  children: R,
                }),
                c.jsxs("div", {
                  children: [
                    c.jsx("div", {
                      style: { fontSize: 12, color: d },
                      children: S,
                    }),
                    c.jsx("div", {
                      style: { fontSize: 11, color: "#fff", marginTop: 1 },
                      children: C,
                    }),
                  ],
                }),
              ],
            },
            S,
          ),
        ),
      ],
    }),
  });
}
const Ba = {
  QB: { peak: 27, decline: 32, cliff: 35 },
  RB: { peak: 24, decline: 27, cliff: 30 },
  WR: { peak: 26, decline: 30, cliff: 33 },
  TE: { peak: 27, decline: 30, cliff: 33 },
};
function Zf(y, S, d, R) {
  const C = { QB: {}, RB: {}, WR: {}, TE: {} };
  return (
    at.forEach((z) => {
      C[z] = { 2022: [], 2023: [], 2024: [] };
    }),
    Object.entries({ 2022: S, 2023: d, 2024: R }).forEach(([z, _]) => {
      Object.entries(_).forEach(([M, A]) => {
        var te;
        if (!A || !A.gp || A.gp < 8) return;
        const W = y[M];
        if (!W) return;
        const Q =
          ((te = W.fantasy_positions) == null ? void 0 : te[0]) || W.position;
        if (!at.includes(Q)) return;
        const B = (A.pts_ppr || 0) / A.gp;
        B > 0 && C[Q][z].push(B);
      });
    }),
    at.forEach((z) =>
      Object.keys(C[z]).forEach((_) => C[z][_].sort((M, A) => M - A)),
    ),
    C
  );
}
function Ai(y, S) {
  if (!y || !(S != null && S.length)) return null;
  const d = S.filter((R) => R < y).length;
  return Math.round((d / S.length) * 100);
}
function qf(y, S, d, R, C) {
  const P = C[R] || {},
    z = (te) =>
      (te == null ? void 0 : te.gp) >= 6 ? (te.pts_ppr || 0) / te.gp : 0,
    _ = Ai(z(y), P[2024]),
    M = Ai(z(S), P[2023]),
    A = Ai(z(d), P[2022]),
    W = [_, M, A].filter((te) => te !== null),
    Q = W.length > 0 ? Math.max(...W) : null;
  return {
    current: _ ?? (Q != null ? Math.round(Q * 0.65) : 40),
    peak: Q,
    p24: _,
    p23: M,
    p22: A,
  };
}
function bf(y, S) {
  return y
    ? y === 1
      ? S <= 10
        ? 95
        : S <= 20
          ? 85
          : 78
      : y === 2
        ? 62
        : y === 3
          ? 45
          : y === 4
            ? 32
            : 18
    : null;
}
function ed(y, S) {
  return y
    ? y === 1 && S <= 10
      ? "Top 10 Pick"
      : y === 1 && S <= 20
        ? "Mid 1st"
        : y === 1
          ? "Late 1st"
          : y === 2
            ? "2nd Round"
            : y === 3
              ? "3rd Round"
              : y === 4
                ? "4th Round"
                : `${y}th Round`
    : null;
}
function td(y, S) {
  const d = Ba[y] || Ba.WR;
  return S <= d.peak
    ? 95
    : S <= d.decline
      ? Math.max(30, 95 - ((S - d.peak) / (d.decline - d.peak)) * 65)
      : S <= d.cliff
        ? Math.max(10, 30 - ((S - d.decline) / (d.cliff - d.decline)) * 20)
        : 5;
}
function nd(y, S) {
  const R = (((y == null ? void 0 : y.gp) || 0) / 17) * 100,
    C = { IR: 20, Out: 10, Doubtful: 5, Questionable: 2, PUP: 15 }[S] || 0;
  return Math.max(0, Math.min(100, R - C));
}
function rd(y, S) {
  const d = (y == null ? void 0 : y.gp) || 0,
    R = (S == null ? void 0 : S.gp) || 0;
  if (d < 4 || R < 4) return 50;
  const C = (y.pts_ppr || 0) / d,
    P = (S.pts_ppr || 0) / R;
  if (P === 0) return 50;
  const z = (C - P) / P;
  return Math.min(100, Math.max(0, 60 + z * 100));
}
function ld(y, S) {
  return S === "FA" ? 20 : y === 1 ? 90 : y === 2 ? 55 : 30;
}
function od(y, S, d, R) {
  const C = td(y.position, y.age),
    P = nd(S, y.injuryStatus),
    z = rd(S, d),
    _ = ld(y.depthOrder, y.team),
    M = bf(y.draftRound, y.draftSlot),
    A = M != null ? ([0.6, 0.4, 0.2][y.yearsExp] ?? 0) : 0,
    W = R ?? 40,
    Q = Math.round(W * (1 - A) + (M ?? W) * A);
  return {
    score: Math.round(C * 0.35 + Q * 0.3 + P * 0.15 + z * 0.1 + _ * 0.1),
    components: {
      age: Math.round(C),
      prod: Math.round(Q),
      avail: Math.round(P),
      trend: Math.round(z),
      situ: Math.round(_),
    },
  };
}
function id(y) {
  return y >= 72 ? "buy" : y >= 52 ? "hold" : y >= 35 ? "sell" : "cut";
}
function $a(y) {
  return (
    { buy: "#00f5a0", hold: "#ffd84d", sell: "#ff6b35", cut: "#ff2d55" }[y] ||
    "#d9deef"
  );
}
function ud(y) {
  if (!y.length) return { grade: "F", color: "#ff2d55", label: "Empty" };
  const S = y.reduce((C, P) => C + P.score, 0) / y.length,
    R = y.filter((C) => C.verdict === "buy").length / y.length;
  return R >= 0.5 && S >= 70
    ? { grade: "A", color: "#00f5a0", label: "Elite Core" }
    : R >= 0.3 && S >= 58
      ? { grade: "B", color: "#7fff7f", label: "Good Shape" }
      : S >= 45
        ? { grade: "C", color: "#ffd84d", label: "Mixed Bag" }
        : { grade: "D", color: "#ff6b35", label: "Needs Work" };
}
function sd(y) {
  const {
      score: S,
      components: d,
      gp24: R,
      peakPctile: C,
      currentPctile: P,
      yearsExp: z,
      draftRound: _,
      draftSlot: M,
    } = y,
    { age: A, situ: W, trend: Q } = d,
    B = z <= 2,
    te = B && _ === 1 && (M || 99) <= 15,
    we = B && _ === 1,
    b = C >= 88,
    q = C >= 72,
    Oe = C >= 55,
    ze = P >= 55,
    ve = P >= 38,
    se = A >= 78,
    _e = A >= 60 && A < 78,
    Z = A >= 40 && A < 60,
    ce = A < 40,
    Se = W >= 75,
    Te = W >= 52,
    Fe = Q < 40;
  if (te && Se) return "Foundational";
  if (we && Se) return "Upside Shot";
  if (we && !Te) return "JAG - Developmental";
  if (_ == null && z <= 1) {
    if (Se) return "Upside Shot";
    if (Te) return "JAG - Developmental";
  }
  return b && Se && !ce
    ? "Cornerstone"
    : ce && b
      ? "Short Term League Winner"
      : (se || _e) && Se && q
        ? "Foundational"
        : se && R < 10 && P < 35
          ? "JAG - Developmental"
          : se && Te && !q
            ? "Upside Shot"
            : (Z || ce) && Oe && Te
              ? "Productive Vet"
              : ze && (ce || Fe)
                ? "Short Term Production"
                : (se || _e) && ve
                  ? "Mainstay"
                  : ve && S >= 38
                    ? "Serviceable"
                    : S >= 28
                      ? "JAG - Insurance"
                      : "Replaceable";
}
function ad(y, S, d, R, C, P, z = {}, _ = [], M = []) {
  var ie, j, F;
  const A = y.players || [],
    W = y.roster_id,
    Q = ((ie = d.settings) == null ? void 0 : ie.draft_rounds) || 5,
    B = new Date().getFullYear(),
    te = [B, B + 1, B + 2],
    we = new Map(
      _.map((m) => {
        var s;
        return [
          m.user_id,
          ((s = m.metadata) == null ? void 0 : s.team_name) ||
            m.team_name ||
            m.display_name,
        ];
      }),
    ),
    b = new Map(
      M.map((m) => {
        var s;
        return [
          m.roster_id,
          we.get(m.owner_id) ||
            ((s = m.settings) == null ? void 0 : s.team_name) ||
            `Roster ${m.roster_id}`,
        ];
      }),
    ),
    q = new Set(
      R.filter((m) => m.roster_id === W && m.owner_id !== W).map(
        (m) => `${m.season}_${m.round}_${m.roster_id}`,
      ),
    ),
    Oe = te.flatMap((m) =>
      Array.from({ length: Q }, (s, v) => v + 1)
        .filter((s) => !q.has(`${m}_${s}_${W}`))
        .map((s) => ({ season: String(m), round: s, isOwn: !0 })),
    ),
    ze = R.filter((m) => m.owner_id === W && m.roster_id !== W).map((m) => ({
      season: String(m.season),
      round: m.round,
      isOwn: !1,
      fromTeam: b.get(m.roster_id) || `Roster ${m.roster_id}`,
    })),
    ve = [...Oe, ...ze].sort(
      (m, s) => m.season.localeCompare(s.season) || m.round - s.round,
    ),
    se =
      ((j = d.roster_positions) == null
        ? void 0
        : j.filter((m) => m === "QB").length) > 1 ||
      ((F = d.roster_positions) == null ? void 0 : F.includes("SUPER_FLEX")),
    _e = Zf(S, z, P, C),
    Z = A.map((m) => {
      var yn, It, Ct, vn;
      const s = S[m];
      if (!s) return null;
      const v =
        ((yn = s.fantasy_positions) == null ? void 0 : yn[0]) || s.position;
      if (!["QB", "RB", "WR", "TE"].includes(v)) return null;
      const I = C[m] || null,
        V = P[m] || null,
        X = z[m] || null,
        K = s.age || 26,
        le = s.years_exp ?? 0,
        ne =
          s.draft_round ??
          ((It = s.metadata) == null ? void 0 : It.draft_round) ??
          null,
        ae =
          s.draft_slot ??
          ((Ct = s.metadata) == null ? void 0 : Ct.draft_slot) ??
          null,
        We =
          s.draft_year ??
          ((vn = s.metadata) == null ? void 0 : vn.draft_year) ??
          null,
        mn = {
          position: v,
          age: K,
          yearsExp: le,
          draftRound: ne,
          draftSlot: ae,
          team: s.team || "FA",
          injuryStatus: s.injury_status || null,
          depthOrder: s.depth_chart_order || 2,
        },
        _t = qf(I, V, X, v, _e),
        { score: en, components: Vn } = od(mn, I, V, _t.current),
        Nr = id(en),
        Lr =
          (I == null ? void 0 : I.gp) > 0
            ? ((I.pts_ppr || 0) / I.gp).toFixed(1)
            : null,
        Hn = (I == null ? void 0 : I.gp) || 0,
        gn = {
          id: m,
          score: en,
          components: Vn,
          verdict: Nr,
          name: `${s.first_name} ${s.last_name}`,
          position: v,
          team: s.team || "FA",
          age: K,
          yearsExp: le,
          draftRound: ne,
          draftSlot: ae,
          draftYear: We,
          injuryStatus: s.injury_status || null,
          ppg: Lr,
          gp24: Hn,
          peakPctile: _t.peak,
          currentPctile: _t.current,
          pctile24: _t.p24,
          pctile23: _t.p23,
          pctile22: _t.p22,
          draftTier: ed(ne, ae),
        };
      return ((gn.archetype = sd(gn)), gn);
    }).filter(Boolean),
    ce = {};
  at.forEach((m) => {
    ce[m] = Z.filter((s) => s.position === m).sort((s, v) => v.score - s.score);
  });
  const Se = Z.reduce((m, s) => m + s.score, 0) || 1,
    Te = {};
  at.forEach((m) => {
    const v = ce[m].reduce((V, X) => V + X.score, 0) / Se,
      I = Kf[m];
    Te[m] = {
      actual: Math.round(v * 100),
      ideal: Math.round(I * 100),
      delta: Math.round((v - I) * 100),
    };
  });
  const Fe = Z.filter((m) => m.verdict === "sell" || m.verdict === "cut").sort(
      (m, s) => m.score - s.score,
    ),
    ct = Z.filter((m) => m.verdict === "buy").sort((m, s) => s.score - m.score),
    Qe = Z.filter((m) => m.verdict === "hold"),
    Ie = Z.length
      ? (Z.reduce((m, s) => m + s.age, 0) / Z.length).toFixed(1)
      : "N/A",
    G = Z.length
      ? Math.round(Z.reduce((m, s) => m + s.score, 0) / Z.length)
      : 0,
    ee = {};
  ve.forEach((m) => {
    const s = m.season || "Unknown";
    (ee[s] || (ee[s] = []), ee[s].push(m));
  });
  const de = at.filter((m) => {
    const s = ce[m];
    return s.length < 2 || s.filter((v) => v.verdict === "buy").length === 0;
  });
  return {
    enriched: Z,
    byPos: ce,
    sells: Fe,
    buys: ct,
    holds: Qe,
    avgAge: Ie,
    avgScore: G,
    picksByYear: ee,
    weakRooms: de,
    isSuperflex: se,
    picks: ve,
    proportions: Te,
  };
}
function cd({
  byPos: y,
  sells: S,
  weakRooms: d,
  proportions: R,
  aiAdvice: C,
  onOpenGradeKey: P,
}) {
  return c.jsxs("div", {
    children: [
      c.jsxs("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
        },
        children: [
          c.jsx("div", {
            style: { ...Y.sectionLabel, marginBottom: 0 },
            children: "Position Room Grades",
          }),
          c.jsx("button", {
            onClick: P,
            title: "Grade key",
            className: "dyn-grade-help",
            style: {
              width: 17,
              height: 17,
              borderRadius: "50%",
              background: "transparent",
              border: "1px solid rgba(0,245,160,0.28)",
              color: "#00f5a0",
              fontSize: 9,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              lineHeight: 1,
            },
            children: "?",
          }),
        ],
      }),
      c.jsx("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 32,
        },
        children: at.map((z) => {
          const _ = ud(y[z]),
            M = y[z],
            A = M.length
              ? Math.round(M.reduce((W, Q) => W + Q.score, 0) / M.length)
              : 0;
          return c.jsxs(
            "div",
            {
              style: {
                ...Y.card,
                borderColor: `${_.color}33`,
                textAlign: "center",
              },
              children: [
                c.jsx("div", {
                  style: {
                    fontSize: 11,
                    letterSpacing: 3,
                    color: "#d1d7ea",
                    marginBottom: 8,
                  },
                  children: z,
                }),
                c.jsx("div", {
                  style: {
                    fontSize: 48,
                    fontWeight: 700,
                    color: _.color,
                    lineHeight: 1,
                  },
                  children: _.grade,
                }),
                c.jsx("div", {
                  style: { fontSize: 10, color: "#d1d7ea", marginTop: 8 },
                  children: _.label,
                }),
                c.jsxs("div", {
                  style: { fontSize: 10, color: "#c8cfe3", marginTop: 4 },
                  children: [M.length, " players · avg ", A],
                }),
              ],
            },
            z,
          );
        }),
      }),
      c.jsxs("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 32,
        },
        children: [
          c.jsxs("div", {
            style: Y.card,
            children: [
              c.jsx("div", { style: Y.sectionLabel, children: "🔴 Sell Now" }),
              S.slice(0, 4).map((z) =>
                c.jsxs(
                  "div",
                  {
                    style: Y.playerRow,
                    children: [
                      c.jsxs("div", {
                        children: [
                          c.jsx("div", {
                            style: { fontSize: 13, color: "#e8e8f0" },
                            children: z.name,
                          }),
                          c.jsxs("div", {
                            style: { fontSize: 11, color: "#fff" },
                            children: [
                              z.team,
                              " · ",
                              z.age,
                              "yo",
                              z.ppg ? ` · ${z.ppg}ppg` : "",
                            ],
                          }),
                        ],
                      }),
                      c.jsx("span", {
                        style: Y.tag($a(z.verdict)),
                        children: z.verdict,
                      }),
                    ],
                  },
                  z.id,
                ),
              ),
              S.length === 0 &&
                c.jsx("div", {
                  style: { fontSize: 12, color: "#d1d7ea" },
                  children: "No obvious sells.",
                }),
            ],
          }),
          c.jsxs("div", {
            style: Y.card,
            children: [
              c.jsx("div", {
                style: Y.sectionLabel,
                children: "🟢 Weak Rooms to Address",
              }),
              d.length === 0
                ? c.jsx("div", {
                    style: { fontSize: 12, color: "#d1d7ea" },
                    children: "All rooms reasonably stocked.",
                  })
                : d.map((z) =>
                    c.jsxs(
                      "div",
                      {
                        style: Y.playerRow,
                        children: [
                          c.jsxs("div", {
                            children: [
                              c.jsxs("div", {
                                style: { fontSize: 13, color: "#e8e8f0" },
                                children: ["Need ", z, " depth"],
                              }),
                              c.jsx("div", {
                                style: { fontSize: 11, color: "#d1d7ea" },
                                children: "Target age 22-24 via trade or draft",
                              }),
                            ],
                          }),
                          c.jsx("span", {
                            style: Y.tag("#ff6b35"),
                            children: "PRIORITY",
                          }),
                        ],
                      },
                      z,
                    ),
                  ),
            ],
          }),
        ],
      }),
      c.jsxs("div", {
        style: { ...Y.card, marginBottom: 16 },
        children: [
          c.jsx("div", {
            style: Y.sectionLabel,
            children: "Roster Value Balance",
          }),
          c.jsx("div", {
            style: {
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 16,
            },
            children: at.map((z) => {
              const _ = R[z],
                M = _.delta > 5,
                A = _.delta < -5,
                W = M ? "#ffd84d" : A ? "#ff6b35" : "#00f5a0";
              return c.jsxs(
                "div",
                {
                  children: [
                    c.jsxs("div", {
                      style: {
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      },
                      children: [
                        c.jsx("span", {
                          style: {
                            fontSize: 10,
                            letterSpacing: 2,
                            color: "#d1d7ea",
                            textTransform: "uppercase",
                          },
                          children: z,
                        }),
                        c.jsxs("span", {
                          style: { fontSize: 10, color: W, fontWeight: 700 },
                          children: [
                            _.actual,
                            "%",
                            c.jsxs("span", {
                              style: {
                                color: "#c8cfe3",
                                fontWeight: 400,
                                marginLeft: 4,
                              },
                              children: ["/ ", _.ideal, "%"],
                            }),
                          ],
                        }),
                      ],
                    }),
                    c.jsxs("div", {
                      style: {
                        height: 4,
                        background: "rgba(255,255,255,0.05)",
                        borderRadius: 2,
                        position: "relative",
                        marginBottom: 3,
                      },
                      children: [
                        c.jsx("div", {
                          style: {
                            height: 4,
                            width: `${Math.min(_.actual, 50) * 2}%`,
                            background: W,
                            borderRadius: 2,
                          },
                        }),
                        c.jsx("div", {
                          style: {
                            position: "absolute",
                            top: -2,
                            left: `${Math.min(_.ideal, 50) * 2}%`,
                            width: 1,
                            height: 8,
                            background: "rgba(255,255,255,0.25)",
                          },
                        }),
                      ],
                    }),
                    c.jsx("div", {
                      style: {
                        fontSize: 9,
                        color: M ? "#ffd84d" : A ? "#ff6b35" : "#c8cfe3",
                        letterSpacing: 1,
                      },
                      children: M
                        ? `+${_.delta}% over`
                        : A
                          ? `${_.delta}% under`
                          : "on target",
                    }),
                  ],
                },
                z,
              );
            }),
          }),
        ],
      }),
      C &&
        c.jsxs("div", {
          style: {
            ...Y.card,
            borderColor: "rgba(0,245,160,0.3)",
            background: "rgba(0,245,160,0.05)",
          },
          children: [
            c.jsxs("div", {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              },
              children: [
                c.jsxs("div", {
                  children: [
                    c.jsx("div", {
                      style: Y.sectionLabel,
                      children: "⚡ AI Verdict",
                    }),
                    c.jsx("div", {
                      style: { fontSize: 14, color: "#e8e8f0" },
                      children: C.overallVerdict,
                    }),
                  ],
                }),
                c.jsxs("div", {
                  style: { textAlign: "center" },
                  children: [
                    c.jsx("div", {
                      style: {
                        fontSize: 40,
                        fontWeight: 700,
                        color: "#00f5a0",
                      },
                      children: C.rebuildScore,
                    }),
                    c.jsx("div", {
                      style: {
                        fontSize: 10,
                        color: "#d1d7ea",
                        letterSpacing: 2,
                      },
                      children: "/ 10",
                    }),
                  ],
                }),
              ],
            }),
            c.jsxs("div", {
              style: { marginTop: 12, fontSize: 12, color: "#d9deef" },
              children: [
                "Timeline to contend:",
                " ",
                c.jsx("span", {
                  style: { color: "#00f5a0" },
                  children: C.timelineToContend,
                }),
              ],
            }),
          ],
        }),
    ],
  });
}
function fd({ picksByYear: y, picks: S }) {
  return c.jsxs("div", {
    children: [
      c.jsx("div", {
        style: Y.sectionLabel,
        children: "Draft Capital by Year",
      }),
      Object.keys(y)
        .sort()
        .map((d) =>
          c.jsxs(
            "div",
            {
              style: { marginBottom: 24 },
              children: [
                c.jsx("div", {
                  style: {
                    fontSize: 12,
                    color: "#00f5a0",
                    letterSpacing: 2,
                    marginBottom: 10,
                  },
                  children: d,
                }),
                c.jsx("div", {
                  style: { display: "flex", flexWrap: "wrap", gap: 8 },
                  children: y[d].map((R, C) => {
                    const P =
                        R.round === 1
                          ? "1st"
                          : R.round === 2
                            ? "2nd"
                            : R.round === 3
                              ? "3rd"
                              : `${R.round}th`,
                      z =
                        R.round === 1
                          ? "#00f5a0"
                          : R.round === 2
                            ? "#ffd84d"
                            : "#d9deef";
                    return c.jsxs(
                      "div",
                      {
                        style: {
                          padding: "8px 16px",
                          background: `${z}11`,
                          border: `1px solid ${z}44`,
                          borderRadius: 2,
                          fontSize: 12,
                          color: z,
                        },
                        children: [
                          P,
                          " Rd",
                          !R.isOwn &&
                            c.jsxs("span", {
                              style: {
                                color: "#d1d7ea",
                                marginLeft: 6,
                                fontSize: 10,
                              },
                              children: ["via ", R.fromTeam || "trade"],
                            }),
                        ],
                      },
                      C,
                    );
                  }),
                }),
              ],
            },
            d,
          ),
        ),
      S.length === 0 &&
        c.jsx("div", {
          style: { ...Y.card, color: "#d1d7ea", fontSize: 13 },
          children: "No future picks found.",
        }),
      c.jsxs("div", {
        style: {
          ...Y.card,
          marginTop: 24,
          borderColor: "rgba(255,211,77,0.2)",
        },
        children: [
          c.jsx("div", {
            style: Y.sectionLabel,
            children: "Pick Strategy Guide",
          }),
          c.jsxs("div", {
            style: { fontSize: 12, color: "#d9deef", lineHeight: 1.8 },
            children: [
              c.jsxs("div", {
                children: [
                  "▸ ",
                  c.jsx("span", {
                    style: { color: "#00f5a0" },
                    children: "1st round picks",
                  }),
                  " — franchise-altering. Never sell cheap.",
                ],
              }),
              c.jsxs("div", {
                children: [
                  "▸ ",
                  c.jsx("span", {
                    style: { color: "#ffd84d" },
                    children: "2nd round picks",
                  }),
                  " — strong currency. Use to fill positional holes.",
                ],
              }),
              c.jsxs("div", {
                children: [
                  "▸ ",
                  c.jsx("span", {
                    style: { color: "#d9deef" },
                    children: "3rd+ picks",
                  }),
                  " — sweeteners. Stack or combine for upgrades.",
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
function Rr({ label: y, value: S, color: d }) {
  return c.jsxs("div", {
    style: { marginBottom: 6 },
    children: [
      c.jsxs("div", {
        style: {
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "#d1d7ea",
          marginBottom: 3,
        },
        children: [
          c.jsx("span", { style: { letterSpacing: 1 }, children: y }),
          c.jsx("span", { style: { color: d }, children: S }),
        ],
      }),
      c.jsx("div", {
        style: {
          height: 3,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 2,
        },
        children: c.jsx("div", {
          style: {
            height: 3,
            width: `${S}%`,
            background: d,
            borderRadius: 2,
            transition: "width 0.4s",
          },
        }),
      }),
    ],
  });
}
function dd({
  byPos: y,
  collapsedRooms: S,
  expandedBars: d,
  onToggleRoom: R,
  onToggleBars: C,
}) {
  return c.jsx("div", {
    children: at.map((P) => {
      const z = !!S[P];
      return c.jsxs(
        "div",
        {
          style: { marginBottom: 32 },
          children: [
            c.jsxs("button", {
              onClick: () => R(P),
              className: "dyn-room-toggle",
              style: {
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "transparent",
                border: "none",
                padding: 0,
                marginBottom: 12,
              },
              children: [
                c.jsxs("div", {
                  className: "dyn-room-label",
                  style: { ...Y.sectionLabel, marginBottom: 0 },
                  children: [P, " Room"],
                }),
                c.jsx("span", {
                  style: {
                    fontSize: 9,
                    color: "#c8cfe3",
                    display: "inline-block",
                    transform: z ? "rotate(-90deg)" : "rotate(0deg)",
                    transition: "transform 0.2s",
                  },
                  children: "▾",
                }),
              ],
            }),
            !z &&
              (y[P].length === 0
                ? c.jsx("div", {
                    style: { ...Y.card, borderColor: "rgba(255,45,85,0.3)" },
                    children: c.jsx("span", {
                      style: { color: "#ff2d55", fontSize: 12 },
                      children: "⚠ Empty — priority fill via draft or trade",
                    }),
                  })
                : y[P].map((_) => {
                    var W;
                    const M = $a(_.verdict),
                      A = !!d[_.id];
                    return c.jsxs(
                      "div",
                      {
                        className: "dyn-card-player",
                        style: { ...Y.card, padding: "16px 20px" },
                        children: [
                          c.jsxs("div", {
                            style: {
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                            },
                            children: [
                              c.jsxs("div", {
                                style: {
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 14,
                                },
                                children: [
                                  c.jsx("div", {
                                    style: {
                                      width: 40,
                                      height: 40,
                                      borderRadius: "50%",
                                      background: `${M}18`,
                                      border: `2px solid ${M}`,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: 13,
                                      color: M,
                                      fontWeight: 700,
                                      flexShrink: 0,
                                    },
                                    children: _.score,
                                  }),
                                  c.jsxs("div", {
                                    children: [
                                      c.jsx("div", {
                                        style: {
                                          fontSize: 14,
                                          color: "#e8e8f0",
                                          fontWeight: 600,
                                        },
                                        children: _.name,
                                      }),
                                      c.jsxs("div", {
                                        style: {
                                          fontSize: 11,
                                          color: "#d1d7ea",
                                          marginTop: 2,
                                        },
                                        children: [
                                          _.team,
                                          " · ",
                                          _.age,
                                          "yo · ",
                                          _.yearsExp,
                                          "yr exp",
                                          _.ppg &&
                                            c.jsxs("span", {
                                              children: [
                                                " ",
                                                "·",
                                                " ",
                                                c.jsxs("span", {
                                                  style: { color: "#e0e5f7" },
                                                  children: [
                                                    _.ppg,
                                                    " ppg (",
                                                    _.gp24,
                                                    "g)",
                                                  ],
                                                }),
                                              ],
                                            }),
                                          _.injuryStatus &&
                                            c.jsx("span", {
                                              style: {
                                                color: "#ff6b35",
                                                marginLeft: 6,
                                              },
                                              children: _.injuryStatus,
                                            }),
                                        ],
                                      }),
                                      c.jsxs("div", {
                                        style: {
                                          fontSize: 10,
                                          color: "#c8cfe3",
                                          marginTop: 3,
                                        },
                                        children: [
                                          "Peak:",
                                          " ",
                                          c.jsx("span", {
                                            style: { color: "#c084fc" },
                                            children:
                                              _.peakPctile != null
                                                ? `${_.peakPctile}th`
                                                : "—",
                                          }),
                                          _.pctile22 != null &&
                                            c.jsxs("span", {
                                              children: [
                                                " ",
                                                "·",
                                                " ",
                                                c.jsxs("span", {
                                                  style: { color: "#d1d7ea" },
                                                  children: [
                                                    "'22: ",
                                                    _.pctile22,
                                                    "th",
                                                  ],
                                                }),
                                              ],
                                            }),
                                          _.pctile23 != null &&
                                            c.jsxs("span", {
                                              children: [
                                                " ",
                                                "·",
                                                " ",
                                                c.jsxs("span", {
                                                  style: { color: "#d1d7ea" },
                                                  children: [
                                                    "'23: ",
                                                    _.pctile23,
                                                    "th",
                                                  ],
                                                }),
                                              ],
                                            }),
                                          _.pctile24 != null &&
                                            c.jsxs("span", {
                                              children: [
                                                " ",
                                                "·",
                                                " ",
                                                c.jsxs("span", {
                                                  style: { color: "#e0e5f7" },
                                                  children: [
                                                    "'24: ",
                                                    _.pctile24,
                                                    "th",
                                                  ],
                                                }),
                                              ],
                                            }),
                                          _.draftTier &&
                                            c.jsxs("span", {
                                              children: [
                                                " ",
                                                "·",
                                                " ",
                                                c.jsxs("span", {
                                                  style: { color: "#ffd84d" },
                                                  children: [
                                                    _.draftYear,
                                                    " ",
                                                    _.draftTier,
                                                  ],
                                                }),
                                              ],
                                            }),
                                        ],
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                              c.jsxs("div", {
                                style: {
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  flexWrap: "wrap",
                                  justifyContent: "flex-end",
                                },
                                children: [
                                  c.jsx("span", {
                                    style: {
                                      ...Y.tag(
                                        ((W = Ua[_.archetype]) == null
                                          ? void 0
                                          : W.color) || "#888",
                                      ),
                                      fontSize: 9,
                                    },
                                    children: _.archetype,
                                  }),
                                  c.jsx("span", {
                                    style: Y.tag(M),
                                    children: _.verdict,
                                  }),
                                  c.jsx("button", {
                                    onClick: () => C(_.id),
                                    title: A
                                      ? "Hide breakdown"
                                      : "Show breakdown",
                                    className: "dyn-expand-btn",
                                    style: {
                                      background: "transparent",
                                      border: "1px solid rgba(255,255,255,0.1)",
                                      borderRadius: 2,
                                      color: "#d1d7ea",
                                      fontSize: 9,
                                      padding: "3px 7px",
                                      letterSpacing: 1,
                                    },
                                    children: A ? "▴" : "▾",
                                  }),
                                ],
                              }),
                            ],
                          }),
                          A &&
                            c.jsxs("div", {
                              style: {
                                marginTop: 14,
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr 1fr",
                                gap: "4px 20px",
                              },
                              children: [
                                c.jsx(Rr, {
                                  label: "Age",
                                  value: _.components.age,
                                  color: "#7b8cff",
                                }),
                                c.jsx(Rr, {
                                  label: "Production",
                                  value: _.components.prod,
                                  color: "#00f5a0",
                                }),
                                c.jsx(Rr, {
                                  label: "Avail",
                                  value: _.components.avail,
                                  color: "#ffd84d",
                                }),
                                c.jsx(Rr, {
                                  label: "Trend",
                                  value: _.components.trend,
                                  color: "#ff6b35",
                                }),
                                c.jsx(Rr, {
                                  label: "Situation",
                                  value: _.components.situ,
                                  color: "#c084fc",
                                }),
                              ],
                            }),
                        ],
                      },
                      _.id,
                    );
                  })),
          ],
        },
        P,
      );
    }),
  });
}
function pd({
  analysis: y,
  selectedLeague: S,
  activeTab: d,
  setActiveTab: R,
  showGradeKey: C,
  setShowGradeKey: P,
  collapsedRooms: z,
  expandedBars: _,
  onToggleRoom: M,
  onToggleBars: A,
  onSwitchLeague: W,
  onGetAIAdvice: Q,
  aiLoading: B,
}) {
  const {
    byPos: te,
    sells: we,
    avgAge: b,
    avgScore: q,
    picksByYear: Oe,
    weakRooms: ze,
    aiAdvice: ve,
    picks: se,
    proportions: _e,
  } = y;
  return c.jsxs(c.Fragment, {
    children: [
      c.jsxs("div", {
        style: Y.header,
        children: [
          c.jsxs("div", {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            },
            children: [
              c.jsxs("div", {
                style: Y.logo,
                children: ["Dynasty  OS — ", S == null ? void 0 : S.name],
              }),
              c.jsx("button", {
                className: "dyn-btn-ghost",
                style: Y.btnGhost,
                onClick: W,
                children: "Switch League",
              }),
            ],
          }),
          c.jsxs("div", {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
            },
            children: [
              c.jsxs("div", {
                children: [
                  c.jsx("h1", { style: Y.title, children: "DynastyDashboard" }),
                  c.jsxs("p", {
                    style: Y.subtitle,
                    children: [
                      "Avg age: ",
                      b,
                      " · Dynasty  score: ",
                      q,
                      "/100 · ",
                      se.length,
                      " ",
                      "picks · ",
                      y.isSuperflex ? "Superflex" : "1QB",
                    ],
                  }),
                ],
              }),
              !ve &&
                c.jsx("button", {
                  className: "dyn-btn",
                  style: Y.btn,
                  onClick: Q,
                  disabled: B,
                  children: B ? "Analyzing..." : "⚡ AI Analysis",
                }),
            ],
          }),
        ],
      }),
      c.jsx("div", {
        style: {
          display: "flex",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          marginBottom: 32,
        },
        children: ["overview", "roster", "picks"].map((Z) =>
          c.jsx(
            "button",
            {
              className: "dyn-tab",
              style: Y.tab(d === Z),
              onClick: () => R(Z),
              children: Z,
            },
            Z,
          ),
        ),
      }),
      C && c.jsx(Jf, { onClose: () => P(!1) }),
      d === "overview" &&
        c.jsx(cd, {
          byPos: te,
          sells: we,
          weakRooms: ze,
          proportions: _e,
          aiAdvice: ve,
          onOpenGradeKey: () => P(!0),
        }),
      d === "roster" &&
        c.jsx(dd, {
          byPos: te,
          collapsedRooms: z,
          expandedBars: _,
          onToggleRoom: M,
          onToggleBars: A,
          positionPriority: at,
        }),
      d === "picks" && c.jsx(fd, { picksByYear: Oe, picks: se }),
    ],
  });
}
function hd({
  username: y,
  setUsername: S,
  onSubmit: d,
  loading: R,
  error: C,
}) {
  return c.jsxs(c.Fragment, {
    children: [
      c.jsxs("div", {
        style: Y.header,
        children: [
          c.jsx("div", { style: Y.logo, children: "Dynasty  OS" }),
          c.jsx("h1", { style: Y.title, children: " " }),
          c.jsx("p", {
            style: Y.subtitle,
            children:
              "Connect your Sleeper roster. Get AI-powered Dynastyguidance.",
          }),
        ],
      }),
      c.jsxs("div", {
        style: { maxWidth: 480 },
        children: [
          c.jsx("div", {
            style: Y.sectionLabel,
            children: "Your Sleeper Username",
          }),
          c.jsx("input", {
            style: Y.input,
            value: y,
            onChange: (P) => S(P.target.value),
            onKeyDown: (P) => P.key === "Enter" && d(),
            placeholder: "e.g. kobidynasty",
          }),
          C &&
            c.jsx("div", {
              style: {
                color: "#ff6b35",
                fontSize: 12,
                marginTop: 8,
                letterSpacing: 1,
              },
              children: C,
            }),
          c.jsx("div", {
            style: { marginTop: 16 },
            children: c.jsx("button", {
              className: "dyn-btn",
              style: Y.btn,
              onClick: d,
              disabled: R || !y,
              children: R ? "Loading..." : "Connect →",
            }),
          }),
          c.jsxs("div", {
            style: {
              marginTop: 32,
              padding: 20,
              background: "rgba(0,245,160,0.03)",
              border: "1px solid rgba(0,245,160,0.1)",
              borderRadius: 4,
            },
            children: [
              c.jsx("div", {
                style: {
                  fontSize: 10,
                  letterSpacing: 3,
                  color: "#00f5a0",
                  marginBottom: 12,
                },
                children: "WHAT YOU'LL GET",
              }),
              [
                "Composite dynasty score — age, production, health, trend",
                "Sell-high & buy-low player targets",
                "Pick capital strategy",
                "AI-powered Dynastytimeline",
                "Positional grade breakdown",
              ].map((P) =>
                c.jsxs(
                  "div",
                  {
                    style: {
                      fontSize: 12,
                      color: "#d9deef",
                      marginBottom: 8,
                      display: "flex",
                      gap: 8,
                    },
                    children: [
                      c.jsx("span", {
                        style: { color: "#00f5a0" },
                        children: "▸",
                      }),
                      " ",
                      P,
                    ],
                  },
                  P,
                ),
              ),
            ],
          }),
        ],
      }),
    ],
  });
}
function Wl({ children: y }) {
  return c.jsxs("div", {
    style: Y.app,
    children: [
      c.jsx("div", { style: Y.grid }),
      c.jsx("div", { style: Y.content, children: y }),
    ],
  });
}
function md({
  leagues: y,
  onSelectLeague: S,
  loading: d,
  selectedLeague: R,
  error: C,
}) {
  return c.jsxs(c.Fragment, {
    children: [
      c.jsxs("div", {
        style: Y.header,
        children: [
          c.jsx("div", {
            style: Y.logo,
            children: "Dynasty  OS — Select League",
          }),
          c.jsx("h1", { style: Y.title, children: "Your Leagues" }),
        ],
      }),
      C &&
        c.jsx("div", {
          style: { color: "#ff6b35", fontSize: 12, marginBottom: 16 },
          children: C,
        }),
      y.map((P) =>
        c.jsxs(
          "button",
          {
            className: "dyn-btn-outline",
            style: Y.btnOutline,
            onClick: () => S(P),
            children: [
              c.jsx("span", { style: { color: "#00f5a0" }, children: "▸ " }),
              P.name,
              c.jsxs("span", {
                style: { color: "#d1d7ea", marginLeft: 12, fontSize: 11 },
                children: [P.total_rosters, " teams · ", P.season],
              }),
              d &&
                (R == null ? void 0 : R.league_id) === P.league_id &&
                c.jsx("span", {
                  style: { color: "#00f5a0", marginLeft: 8 },
                  children: "Loading...",
                }),
            ],
          },
          P.league_id,
        ),
      ),
      !y.length &&
        !d &&
        c.jsx("div", {
          style: { color: "#d1d7ea", fontSize: 12, marginTop: 12 },
          children: "No leagues found for this account in recent seasons.",
        }),
    ],
  });
}
async function Et(y) {
  const S = await fetch(`/sleeper${y}`);
  if (!S.ok) throw new Error(`Sleeper API error: ${S.status}`);
  return S.json();
}
function gd() {
  const [y, S] = qe.useState("input"),
    [d, R] = qe.useState(() => localStorage.getItem("sleeper_username") || ""),
    [C, P] = qe.useState([]),
    [z, _] = qe.useState(null),
    [M, A] = qe.useState(!1),
    [W, Q] = qe.useState(""),
    [B, te] = qe.useState(null),
    [we, b] = qe.useState(!1),
    [q, Oe] = qe.useState("overview"),
    [ze, ve] = qe.useState(!1),
    [se, _e] = qe.useState({}),
    [Z, ce] = qe.useState({});
  function Se(G) {
    _e((ee) => ({ ...ee, [G]: !ee[G] }));
  }
  function Te(G) {
    ce((ee) => ({ ...ee, [G]: !ee[G] }));
  }
  qe.useEffect(() => {
    const G = localStorage.getItem("sleeper_username"),
      ee = localStorage.getItem("sleeper_league");
    G && ee && (R(G), Fe(JSON.parse(ee), G));
  }, []);
  async function Fe(G, ee) {
    (_(G), A(!0), Q(""));
    try {
      const [de, ie, j, F, m, s, v] = await Promise.all([
          Et(`/league/${G.league_id}/users`),
          Et(`/league/${G.league_id}/rosters`),
          Et("/players/nfl").catch(() => ({})),
          Et(`/league/${G.league_id}/traded_picks`).catch(() => []),
          Et("/stats/nfl/regular/2024").catch(() => ({})),
          Et("/stats/nfl/regular/2023").catch(() => ({})),
          Et("/stats/nfl/regular/2022").catch(() => ({})),
        ]),
        I = de.find((K) => {
          var le;
          return (
            ((le = K.display_name) == null ? void 0 : le.toLowerCase()) ===
            ee.toLowerCase()
          );
        });
      if (!I) throw new Error("Could not find your roster in this league.");
      const V = ie.find((K) => K.owner_id === I.user_id);
      if (!V) throw new Error("Roster not found.");
      const X = ad(V, j, G, F, m, s, v, de, ie);
      (te(X), S("dashboard"));
    } catch (de) {
      (localStorage.removeItem("sleeper_league"),
        Q(de.message || "Failed to load dashboard."),
        S("input"));
    }
    A(!1);
  }
  async function ct() {
    (A(!0), Q(""));
    try {
      const G = await Et(`/user/${d}`);
      if (!(G != null && G.user_id)) throw new Error("User not found");
      localStorage.setItem("sleeper_username", d);
      const ee = new Date(),
        de = ee.getMonth() >= 7 ? ee.getFullYear() : ee.getFullYear() - 1,
        [ie, j] = await Promise.all([
          Et(`/user/${G.user_id}/leagues/nfl/${de}`).catch(() => []),
          Et(`/user/${G.user_id}/leagues/nfl/${de - 1}`).catch(() => []),
        ]),
        F = new Map();
      [...ie, ...j].forEach((v) => {
        v != null && v.league_id && F.set(v.league_id, v);
      });
      const m = Array.from(F.values()).sort(
          (v, I) => Number(I.season || 0) - Number(v.season || 0),
        ),
        s = m.filter((v) => {
          var I, V;
          return (
            ((I = v.settings) == null ? void 0 : I.type) === 2 ||
            ((V = v.name) == null
              ? void 0
              : V.toLowerCase().includes("dynasty"))
          );
        });
      (P(s.length ? s : m), S("leagues"));
    } catch (G) {
      Q(G.message || "Could not find user. Check your Sleeper username.");
    }
    A(!1);
  }
  async function Qe(G) {
    (localStorage.setItem("sleeper_league", JSON.stringify(G)), await Fe(G, d));
  }
  async function Ie() {
    var G;
    if (B) {
      b(!0);
      try {
        const ee = `You are an expert dynasty fantasy football advisor. Analyze this roster and give sharp, actionable Dynastyadvice.

ROSTER SUMMARY (score 0-100, archetype, ppg = 2024 PPR pts/game):
${at.map(
  (m) =>
    `${m}: ${B.byPos[m].map((s) => `${s.name} (${s.age}yo, score ${s.score}, ${s.archetype}, ${s.ppg ? `${s.ppg}ppg/${s.gp24}g` : "no stats"})`).join(" | ") || "EMPTY"}`,
).join(`
`)}

POSITION VALUE BALANCE (actual% vs ideal%):
${at.map((m) => `${m}: ${B.proportions[m].actual}% actual vs ${B.proportions[m].ideal}% ideal (${B.proportions[m].delta > 0 ? "+" : ""}${B.proportions[m].delta}%)`).join(" · ")}

DRAFT PICKS: ${B.picks.length} picks across ${Object.keys(B.picksByYear).join(", ")}
WEAK ROOMS: ${B.weakRooms.join(", ") || "None"}
AVG ROSTER AGE: ${B.avgAge} · AVG DYNASTY SCORE: ${B.avgScore}/100
FORMAT: ${B.isSuperflex ? "Superflex" : "1QB"}

Give advice in this EXACT JSON format (no markdown, no backticks):
{
  "overallVerdict": "one sentence on Dynastystatus",
  "rebuildScore": 1-10,
  "topSells": [{"name": "player name", "reason": "why sell now"}],
  "topBuys": [{"position": "pos", "target": "type of player to target", "why": "reason"}],
  "pickStrategy": "one paragraph on pick strategy",
  "timelineToContend": "realistic timeline estimate",
  "winNowMoves": ["move 1", "move 2"],
  "strengths": ["strength 1", "strength 2"],
  "warnings": ["warning 1", "warning 2"]
}`,
          j =
            ((G = (
              await (
                await fetch("https://api.anthropic.com/v1/messages", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    model: "claude-sonnet-4-20250514",
                    max_tokens: 1e3,
                    messages: [{ role: "user", content: ee }],
                  }),
                })
              ).json()
            ).content) == null
              ? void 0
              : G.map((m) => m.text || "").join("")) || "",
          F = JSON.parse(j.replace(/```json|```/g, "").trim());
        te((m) => ({ ...m, aiAdvice: F }));
      } catch (ee) {
        console.error("AI error:", ee);
      }
      b(!1);
    }
  }
  return y === "input"
    ? c.jsx(Wl, {
        children: c.jsx(hd, {
          username: d,
          setUsername: R,
          onSubmit: ct,
          loading: M,
          error: W,
        }),
      })
    : y === "leagues"
      ? c.jsx(Wl, {
          children: c.jsx(md, {
            leagues: C,
            onSelectLeague: Qe,
            loading: M,
            selectedLeague: z,
            error: W,
          }),
        })
      : y === "dashboard" && B
        ? c.jsx(Wl, {
            children: c.jsx(pd, {
              analysis: B,
              selectedLeague: z,
              activeTab: q,
              setActiveTab: Oe,
              showGradeKey: ze,
              setShowGradeKey: ve,
              collapsedRooms: se,
              expandedBars: Z,
              onToggleRoom: Se,
              onToggleBars: Te,
              onSwitchLeague: () => {
                (localStorage.removeItem("sleeper_league"), S("leagues"));
              },
              onGetAIAdvice: Ie,
              aiLoading: we,
            }),
          })
        : c.jsx(Wl, {
            children: c.jsx("div", {
              style: { textAlign: "center", padding: 80, color: "#d1d7ea" },
              children: "Loading...",
            }),
          });
}
Gf.createRoot(document.getElementById("root")).render(
  c.jsx(qe.StrictMode, { children: c.jsx(gd, {}) }),
);
