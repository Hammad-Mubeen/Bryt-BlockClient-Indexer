const {
    GraphQLObjectType,
    GraphQLList,
    GraphQLString
} = require("graphql");

const { blocksType } = require('./blocks');

const blocksWithCountType = new GraphQLObjectType({
  
    name: "blocksWithCount",
    description: "blocks with count type",
    fields: () => ({
        blocks: {type: GraphQLList(blocksType)},
        count: {type:  GraphQLString}
  })
});
  
module.exports = { blocksWithCountType };

