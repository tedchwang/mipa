import Vue from "vue";
import { uid, Notify } from "quasar";
import { firebase, firebaseDb, firebaseAuth } from "boot/firebase";
import { firestoreAction } from "vuexfire";
import { showErrorMessage } from "src/functions/function-show-error-message";

const state = {
  nodes: []
};

const mutations = {};

const actions = {
  bindNodes: firestoreAction(({ bindFirestoreRef }, teamId) => {
    let userId = firebaseAuth.currentUser.uid;
    // return the promise returned by `bindFirestoreRef`
    return bindFirestoreRef(
      "nodes",
      firebaseDb
        .collection("teams")
        .doc(teamId)
        .collection("nodes"),
      {
        reset: true,
        maxRefDepth: 1
      }
    );
  }),

  unbindNodes: firestoreAction(({ unbindFirestoreRef }) => {
    unbindFirestoreRef("nodes");
  }),

  addNode({}, payload) {
    let node = payload.node;
    node.createTime = firebase.firestore.FieldValue.serverTimestamp();
    node.createdBy = firebaseAuth.currentUser.uid;
    firebaseDb
      .collection("teams")
      .doc(payload.teamId)
      .collection("nodes")
      .add(node)
      .then(function() {
        Notify.create("Node added!");
      })
      .catch(function(error) {
        showErrorMessage("Error adding node", error.message);
      });
  },

  updateNode({ dispatch }, payload) {
    let teamId = payload.teamId;
    let nodeId = payload.updates.id;

    let formulaChanged = false;
    payload.updates.updateTime = firebase.firestore.FieldValue.serverTimestamp();
    payload.updates.updatedBy = firebaseAuth.currentUser.uid;

    let nodesRef = firebaseDb
      .collection("teams")
      .doc(teamId)
      .collection("nodes");
    nodesRef
      .doc(nodeId)
      .set(payload.updates, { merge: true })
      .then(function() {
        let keys = Object.keys(payload.updates);
        Notify.create("Node updated!");
        dispatch("calculator/calculateBaseline", teamId, { root: true });
      })
      .catch(function(error) {
        showErrorMessage("Error updating node", error.message);
      });
  },

  addLink({ dispatch }, payload) {
    let link = payload.link;
    if (link.sourceNodeId == link.targetNodeId) {
      throw new Error("Source node and target node cannot be the same node!");
    }
    switch (link.targetType) {
      case "influencer":
        var influencerNodeId = link.targetNodeId;
        var influenceeNodeId = link.sourceNodeId;
        break;
      case "influencee":
        var influencerNodeId = link.sourceNodeId;
        var influenceeNodeId = link.targetNodeId;
        break;
      default:
        throw new Error(
          'Link target type must be "influencer" or "influencee".'
        );
    }

    var nodesRef = firebaseDb
      .collection("teams")
      .doc(payload.teamId)
      .collection("nodes");
    var batch = firebaseDb.batch();
    batch.update(nodesRef.doc(influencerNodeId), {
      influencees: firebase.firestore.FieldValue.arrayUnion(influenceeNodeId)
    });
    batch.update(nodesRef.doc(influenceeNodeId), {
      influencers: firebase.firestore.FieldValue.arrayUnion(influencerNodeId)
    });
    batch
      .commit()
      .then(function() {
        Notify.create("Link added!");
      })
      .catch(function(error) {
        showErrorMessage("Error adding link", error.message);
      });

    //update class of source and target nodes
    dispatch("reDetermineNodeClass", {
      teamId: payload.teamId,
      nodeId: link.sourceNodeId
    });
    dispatch("reDetermineNodeClass", {
      teamId: payload.teamId,
      nodeId: link.targetNodeId
    });
  },

  reDetermineNodeClass({}, payload) {
    // Create a reference to the node doc.
    var nodeDocRef = firebaseDb
      .collection("teams")
      .doc(payload.teamId)
      .collection("nodes")
      .doc(payload.nodeId);

    firebaseDb
      .runTransaction(function(transaction) {
        // This code may get re-run multiple times if there are conflicts.
        return transaction.get(nodeDocRef).then(function(nodeDoc) {
          if (!nodeDoc.exists) {
            throw "Node document does not exist!";
          }
          var node = nodeDoc.data();
          var hasInfluencers =
            node.influencers && node.influencers.length ? true : false;
          var hasInfluencees =
            node.influencees && node.influencees.length ? true : false;
          var oldClass = node.class;
          var docToBeUpdated = false; //this is a workround for the firestore limitation "FirebaseError: Every document read in a transaction must also be written."
          if (!hasInfluencers && !hasInfluencees && oldClass != "unlinked") {
            transaction.update(nodeDocRef, { class: "unlinked" });
            docToBeUpdated = true;
          } else if (!hasInfluencers && hasInfluencees && oldClass != "input") {
            transaction.update(nodeDocRef, { class: "input" });
            docToBeUpdated = true;
          } else if (
            hasInfluencers &&
            !hasInfluencees &&
            oldClass != "output"
          ) {
            transaction.update(nodeDocRef, { class: "output" });
            docToBeUpdated = true;
          } else if (hasInfluencers && hasInfluencees && oldClass != "state") {
            transaction.update(nodeDocRef, { class: "state" });
            docToBeUpdated = true;
          }
          if (docToBeUpdated == false) {
            //perform a dummy write as a workaround to the firestore limitation "FirebaseError: Every document read in a transaction must also be written."
            transaction.update(nodeDocRef, {});
          }
        });
      })
      .then(function() {
        //console.log("Transaction successfully committed!");
      })
      .catch(function(error) {
        console.log("reDetermineNodeClass failed: ", error);
      });
  }
};

const getters = {
  nodes: state => {
    if (!state.nodes) {
      return [];
    }
    return state.nodes.map(node => ({ ...node, id: node.id }));
  },
  links: state => {
    let allLinks = [];
    state.nodes.forEach(function(node) {
      //console.log(node.id);
      if ("influencers" in node) {
        node.influencers.forEach(function(influencer) {
          allLinks.push({ source: influencer, target: node.id });
        });
      }
    });
    return allLinks;
  }
};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};
