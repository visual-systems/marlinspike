# Marlinspike

*AKA "spike"*

Visual Systems Implementation - IDE and Language Interfaces.

Marlinspike sits in a gap between three worlds that currently don't talk to each other — formal PL theory (interaction nets, arrows, Reo), practical visual programming (Node-RED, Flyde, Rete.js), and the emerging AI-native tooling wave (MCP, agentic IDEs). Each world has done its part in isolation. The synthesis is the novel contribution.

There are many facets to this system, and it is explained
in much greater detail in `DESIGN.md`, however here is a high-level overview:

* Graphs, with nodes, edges, subgraphs, properties
* A database of graphs - referencable by URI
* A JSON based serial format for graphs amenable to CRDT style workflows
* A UI for editing graphs - Convenient force-layout based graph editing UI
* Focus on what you currently care about - level of abstraction, property-sets, etc. - wear a persona hat
* Workflows, similar to "language-modes" in other IDEs
* Constraint systems - Impose topologies, property schemas, either defined or delegated
* Composable - Overlay compatible graphs or work to make them compatible - Reuse concepts directly via reference, or inheritence
* Collaborative - Delegate implementation work, or even design work to others - Marlinspike will help you make it coherent

## Notions not Yet Explored

* A dedicated graph database / API
* Applying overlays and modifications to referenced graphs
* A 'class' system for templating new nodes
* A 'workflow' notion - along wth the existing 'persona' notion, workflows could allow you to easily create projects of a certain type
* Embeddable explorer UI - allow interactive examples in documentation, etc.
* Examples - lots of examples of projects and graphs - the scheme like syntax could be used for documentation examples
  * Solar calculator - input roof properties and proposed solar placement and geographic information for predicted yields
  * J program editor
  * Kubernetes services configuration developer - define your cluster and have inter-service communication formalised over typed APIs or queues