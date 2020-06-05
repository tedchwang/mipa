//import { parse, format, toTex } from "mathjs";
importScripts("https://unpkg.com/mathjs@6.6.4/dist/math.min.js");

const parser = self.math.parser();

onmessage = function(e) {
  switch (e.data.calculationType) {
    case "baseline":
      calculateBaseline(e.data);
      break;
    default:
      console.err(
        `calculationType "${e.data.calculationType}" not recognized.`
      );
  }
};

function prepEnvironment() {
  var errorOccurred = false;

  //import custom functions
  delay.rawArgs = true;
  math.import({
    delay: delay
  });

  //create currency units

  //create custom units
  math.createUnit({
    person: {
      baseName: "person",
      aliases: ["persons", "people"]
    }
  });

  return errorOccurred;
}

function calculateBaseline(data) {
  let startTime = new Date();
  var errorOccurred = false;

  errorOccurred = prepEnvironment();

  let nodes = prepForSort(data.modelNodes);
  //console.log("nodes: ", nodes);
  let sortedNodes = topoSort(nodes);

  //prepare scope object
  let initialTimeS = Math.floor(Date.now() / 1000);
  //let initialDate = new Date(initialTimeS * 1000);
  //console.log({ initialDate });

  let scope = {
    initialTimeS: initialTimeS, //this will remain constant throughout the simulation
    timeS: initialTimeS, //timeS will increment with each iteration
    dt: math.unit("1 month"), //delta time
    timeSeries: { timeSPoints: [], nodes: {} }
  }; //todo: load timeSeries with current or historical values
  sortedNodes.forEach(function(node, index) {
    scope.timeSeries.nodes[node.id] = [];
  });
  //console.log({ sortedNodes });

  let completedLoops = 0;
  let maxLoops = 60;

  // gather up current values from nodes into scope
  //console.log("begin loading currentValues");
  sortedNodes.forEach(function(node, index) {
    if (!errorOccurred)
      try {
        scope["$" + node.id + "_unit"] = node.unit;
        if ("currentValue" in node && node.currentValue != "") {
          scope["$" + node.id] = math.unit(
            Number(node.currentValue),
            node.unit
          );
        }
      } catch (err) {
        this.postMessage({
          errorType: "current value loading error",
          errorMessage: `For node "${node.name}", current value "${node.currentValue}", unit "${node.unit}" <br/> ${err}`
        });
        errorOccurred = true;
      }
  });

  if (errorOccurred) return;

  // gather up formulas from nodes into an array ordered by calculation order
  var expressionsArray = [];
  sortedNodes.forEach(function(node) {
    if (!errorOccurred)
      try {
        //if formula includes a variable then save it
        if (node.sysFormula.includes("$")) {
          return "$" + node.id + " = " + node.sysFormula;
        } else {
          //else set as value and units
          return (
            "$" +
            node.id +
            " = unit(" +
            node.sysFormula +
            ",'" +
            node.unit +
            "')"
          );
        }
      } catch (err) {
        console.log(err);
        this.postMessage({
          errorType: "expression array error",
          errorMessage: `For node "${node.name}" <br/> ${err}`
        });
      }
  });

  if (errorOccurred) return;

  var parsedExpressions = [];
  expressionsArray.forEach(function(expression) {
    if (!errorOccurred)
      try {
        parsedExpressions.push(math.parse(expression));
      } catch (err) {
        let nodeName = replace$NodeIdsWithName(
          expression.split(" =")[0],
          data.modelNodes
        );
        let replacedExpression = replace$NodeIdsWithSymbol(
          expression,
          data.modelNodes
        );
        this.postMessage({
          errorType: "parse error",
          errorMessage: `For node "${nodeName}"<br/>Expression: ${replacedExpression} <br/> ${err}`
        });
        errorOccurred = true;
      }
  });

  if (errorOccurred) return;

  try {
    var compiledExpressions = parsedExpressions.map(function(expression) {
      return expression.compile();
    });
  } catch (err) {
    console.log(err);
    this.postMessage(err);
  }

  if (errorOccurred) return;

  var expectedUnit = null;
  var expectedUnits = [];

  sortedNodes.forEach(function(node) {
    if (!errorOccurred)
      try {
        expectedUnits.push(math.unit(node.unit));
      } catch (err) {
        //console.log(err);
        this.postMessage({
          errorType: "unit loading error",
          errorMessage: `For node "${node.name}", unit "${node.unit}" <br/> ${err}`
        });
        errorOccurred = true;
      }
  });

  if (errorOccurred) return;

  try {
    while (completedLoops < maxLoops) {
      // evaluate the formulas
      compiledExpressions.forEach(function(code, index) {
        //todo: if timeS == initialTimeS then evaluate current value
        code.evaluate(scope);
        //on first 2 loops, check result of evaluation against units expected by user.
        if (completedLoops < 2) {
          expectedUnit = expectedUnits[index];
          if (
            !expectedUnits[index].equalBase(scope["$" + sortedNodes[index].id])
          )
            throw "Dimensions of expected units and calculated units do not match for node " +
              sortedNodes[index].id +
              " (" +
              sortedNodes[index].name +
              ")." +
              " Expected: " +
              expectedUnit.toString() +
              " Calculated: " +
              scope["$" + sortedNodes[index].id].toString();
        }
      });

      //save time and node values into results object
      scope.timeSeries.timeSPoints.push(scope.timeS);
      sortedNodes.forEach(function(node, index) {
        scope.timeSeries.nodes[node.id].push(scope["$" + node.id]);
      });
      scope.timeS = scope.timeS + scope.dt.toNumber("seconds");
      completedLoops++;
      this.postMessage({ progressValue: completedLoops / maxLoops });
      //console.log("completed loop ", completedLoops);
    }
  } catch (err) {
    console.log(err);
    this.postMessage(err);
  }

  if (errorOccurred) return;

  //clean up scope.timeSeries for posting back to main script
  //console.log(scope);
  let resultTimeSeriesNodesValues = {};
  sortedNodes.forEach(function(node, index) {
    let nodeValues = scope.timeSeries.nodes[node.id].map(function(val) {
      //get only the numeric value of each value entry in the array
      if (typeof val == "number") {
        return val;
      } else {
        return val.toNumber(node.unit);
      }
    });
    resultTimeSeriesNodesValues[node.id] = nodeValues;
  });

  let outputTimeSeries = {
    timeSPoints: scope.timeSeries.timeSPoints,
    nodes: resultTimeSeriesNodesValues
  };
  let endTime = new Date();
  console.log("calcTime:", endTime - startTime, "ms");
  //console.log("Posting message back to main script");
  //console.log({ scope });
  //console.log(outputTimeSeries);
  postMessage(outputTimeSeries);
}

function topoSort(nodes) {
  let L = []; //for storing sorted elements
  let S = nodes.filter(node => node.blockingInDegree == 0); //nodes with no incoming edges
  let unvisitedNodes = nodes.filter(node => node.blockingInDegree != 0);
  let n = null; //node to process
  let influencee = null; //a working variable

  while (S.length) {
    // remove a node n from S and append to tail of L
    n = S.shift();
    L.push(n);
    //console.log("n: ", n);
    n.blockedInfluencees.forEach(function(influenceeId, index) {
      influencee = unvisitedNodes.find(node => node.id == influenceeId);
      influencee.blockingInDegree--;
      if (influencee.blockingInDegree == 0) {
        S.push(influencee);
        //remove influencee from unvisited nodes
        for (var i = 0; i < unvisitedNodes.length; i++) {
          if (unvisitedNodes[i] === influencee) {
            unvisitedNodes.splice(i, 1);
          }
        }
      }
    });
  }
  //now try to sort out unvisited nodes (ones in or blocked by a cycle)

  try {
    //if there are unvisited nodes, then graph has at least one cycle
    if (unvisitedNodes.length) {
      console.log("unvisitedNodes: ", unvisitedNodes);
      throw "Circular dependency detected.";
    }
  } catch (err) {
    console.log(err);
    this.postMessage(err);
  }
  return L;
}

function prepForSort(nodes) {
  let preppedNodes = [];
  nodes.forEach(function(outerNode) {
    // calculate blockedInfluencees
    let blockedInfluencees = [];
    //examine each candidate node to check for current node being in blockingInfluencers
    nodes.forEach(function(innerNode) {
      if (innerNode.id != outerNode.id) {
        //skip self
        if (
          "blockingInfluencers" in innerNode &&
          innerNode.blockingInfluencers.includes(outerNode.id)
        ) {
          blockedInfluencees.push(innerNode.id);
        }
      }
    });
    preppedNodes.push({
      id: outerNode.id,
      name: outerNode.name,
      blockingInDegree:
        typeof outerNode.blockingInfluencers !== "undefined"
          ? outerNode.blockingInfluencers.length
          : 0,
      blockedInfluencees: blockedInfluencees,
      sysFormula:
        typeof outerNode.sysFormula !== "undefined" ? outerNode.sysFormula : "",
      unit: typeof outerNode.unit !== "undefined" ? outerNode.unit : "",
      currentValue:
        typeof outerNode.currentValue !== "undefined"
          ? outerNode.currentValue
          : ""
    });
  });
  return preppedNodes;
}

function delay(args, math, scope) {
  let $nodeId = args[0].name;
  let nodeId = $nodeId.substr(1);
  let delayTime = args[1].compile().evaluate(scope);
  let initialValue = null;
  let currentValue = scope[$nodeId];
  if (args.length <= 1) {
    console.error('"delay" function needs at least 2 arguments.');
    throw '"delay" function needs at least 2 arguments.';
  } else if (args.length == 2) {
    //no initial value defined
  } else if (args.length == 3) {
    if (typeof args[2] == "number") initialValue = args[2];
    else if (args[2] == "best_guess") initialValue = "best_guess";
    else {
      console.error("Initial value not recognized for " + nodeId);
      throw "Initial value not recognized for " + nodeId;
    }
  } else {
    console.error('"delay" function takes at most 3 arguments.');
    throw '"delay" function takes at most 3 arguments.';
  }

  let values = scope.timeSeries.nodes[nodeId];
  let timeSPoints = scope.timeSeries.timeSPoints;
  //let defaultValue = scope[$nodeId];
  let targetTimeS = scope.timeS - delayTime.toNumber("seconds");

  //interpolate value at targetTimeS
  return interpolate(
    timeSPoints,
    values,
    targetTimeS,
    initialValue,
    currentValue,
    nodeId
  );
}

function interpolate(
  rawTimeSPoints,
  rawValues,
  targetTimeS,
  initialValue,
  currentValue,
  nodeId
) {
  let timeSPoints = [];
  let values = [];
  //extract only available data points
  //todo: only extract data points surrounding targetTimeS
  for (var i = 0; i < rawTimeSPoints.length; i++) {
    //if (typeof rawValuesWithUnits[i] == "number") {
    timeSPoints.push(rawTimeSPoints[i]);
    values.push(rawValues[i]);
    //}
  }
  //console.log(timeSPoints[0], timeSPoints[timeSPoints.length - 1], targetTimeS);
  //if symbol has no history, then return default value
  if (values.length == 0) {
    //console.log("No history; using default value.");
    //if (typeof initialValue == "number") return initialValue;
    if (valueIsANumber(initialValue))
      return math.unit(Number(initialValue), scope["$" + nodeId + "_unit"]);
    else if (initialValue == "best_guess") {
      //if currentValue is available then return current value
      if (currentValue != "") return currentValue;
      else {
        console.error(
          "No history, no initial value, and no current value available for best guess for node id " +
            nodeId +
            " initialValue: " +
            typeof initialValue +
            " " +
            initialValue
        );
        throw "No history, no initial value, and no current value available for best guess for node id " +
          nodeId +
          " initialValue: " +
          typeof initialValue +
          " " +
          initialValue;
      }
    } else {
      console.error(
        "No history and no initial value available for node id " +
          nodeId +
          " initialValue: " +
          typeof initialValue +
          " " +
          initialValue
      );
      throw "No history and no initial value available for node id " + nodeId;
    }
  }
  //else if history starts after target time, then return initial value if available, or first value in history
  else if (timeSPoints[0] > targetTimeS) {
    //console.log("History starts after target time; using default value if available, else first value in history.");
    if (valueIsANumber(initialValue))
      return math.unit(Number(initialValue), scope["$" + nodeId + "_unit"]);
    else if (initialValue == "best_guess") return values[0];
  }
  //else if history ends before target time, then return last value in history
  else if (timeSPoints[timeSPoints.length - 1] < targetTimeS) {
    //console.log("History ends before target time; using initialValue or best_guess.");
    if (valueIsANumber(initialValue))
      return math.unit(Number(initialValue), scope["$" + nodeId + "_unit"]);
    else if (initialValue == "best_guess") return values[values.length - 1];
  }
  //else if history is only one point (should be at targetTimeS) then return its value
  else if (timeSPoints.length == 1) {
    //console.log("History is only one point; using it.");
    return values[0];
  }
  //else interpolate
  else {
    //console.log("Going to interpolate.");
    return interpolateFromLookup(timeSPoints, values, targetTimeS);
  }
}

function interpolateFromLookup(timeSPoints, values, targetTimeS) {
  //console.log({ timeSPoints, values, targetTimeS });

  var i = 0;
  //find index when targetTimeS equals or exceeds position in timeSPoints
  try {
    while (timeSPoints[i] < targetTimeS) {
      i++;
    }
    if (i == 0) return values[0];
    let t0 = timeSPoints[i - 1];
    let t1 = timeSPoints[i];
    let v0 = values[i - 1];
    let v1 = values[i];
    //let vt = v0 + ((targetTimeS - t0) * (v1 - v0)) / (t1 - t0);
    let vt = math.add(
      v0,
      math.divide(
        math.multiply(targetTimeS - t0, math.subtract(v1, v0)),
        t1 - t0
      )
    );
    //console.log({ t0, t1, v0, v1, targetTimeS, vt });
    return vt;
  } catch (err) {
    console.log(err);
  }
}

function valueIsANumber(val) {
  //console.log(val, typeof val != "undefined", val != "", !isNaN(Number(val)));
  return typeof val != "undefined" && val != "" && !isNaN(Number(val));
}

function replace$NodeIdsWithName(workingString, nodes) {
  nodes.forEach(
    node => (workingString = workingString.replace("$" + node.id, node.name))
  );
  return workingString;
}

function replace$NodeIdsWithSymbol(workingString, nodes) {
  nodes.forEach(
    node => (workingString = workingString.replace("$" + node.id, node.symbol))
  );
  return workingString;
}
