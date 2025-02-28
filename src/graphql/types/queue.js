const {
    GraphQLObjectType,
    GraphQLID,
    GraphQLString
} = require("graphql");

const queueType = new GraphQLObjectType({
  
    name: "queue",
    description: "queue type",
    fields: () => ({
        hash: {type : GraphQLString},
        Status: {type : GraphQLString},
        timestamp: {type : GraphQLString},
        data: {type : GraphQLString}
  })
});
  
module.exports = { queueType };

