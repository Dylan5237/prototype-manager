import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildProjectWorkspaceQuery,
  findFirstBoundMenu,
  findMenuByPath,
  listMenuLeaves,
  normalizeMenuConfigForBindings,
  readRouteQueryValue,
  resolveRequestedProjectMenu
} from '../src/utils/project-menu.js'

const menu={items:[{key:'design',label:'建模设计',children:[{key:'domain',label:'业务域建模',children:[{key:'entity',label:'实体建模',children:[]},{key:'method',label:'方法建模',children:[]}]}]}]}

test('resolves three-level leaf paths and preserves display order',()=>{
  assert.equal(findMenuByPath(menu,'design/domain/entity').node.label,'实体建模')
  assert.deepEqual(listMenuLeaves(menu).map(item=>item.path),['design/domain/entity','design/domain/method'])
  assert.equal(findFirstBoundMenu(menu,[{menu_path:'design/domain/method'}]).node.label,'方法建模')
})

test('normalizes a missing three-level legacy binding without flattening it',()=>{
  const normalized=normalizeMenuConfigForBindings({items:[]},[{menu_path:'design/domain/api',prototype_name:'接口建模原型'}])
  const result=findMenuByPath(normalized,'design/domain/api')
  assert.equal(result.node.label,'接口建模原型')
  assert.equal(result.ancestors.length,2)
})

const siblingMenu={
  items:[{
    key:'modeling_design',
    label:'建模设计',
    children:[
      {id:'n-unbound',key:'domain_modeling',label:'业务域建模',children:[]},
      {id:'n-bound',key:'tiangong_entity_modeling',label:'天宫业务域实体建模',children:[]}
    ]
  }]
}
const siblingBindings=[{
  prototype_id: 42,
  node_id: 'n-bound',
  menu_path: 'modeling_design/tiangong_entity_modeling',
  prototype_name: '天宫实体建模原型'
}]

test('joins slash-split menuPath query arrays and prefers prototypeId',()=>{
  assert.equal(readRouteQueryValue(['modeling_design','tiangong_entity_modeling']),'modeling_design/tiangong_entity_modeling')
  assert.equal(readRouteQueryValue('modeling_design%2Ftiangong_entity_modeling'),'modeling_design/tiangong_entity_modeling')
  assert.deepEqual(
    buildProjectWorkspaceQuery({ prototypeId: 42, menuPath: 'modeling_design/tiangong_entity_modeling' }),
    { prototypeId: '42', menuPath: 'modeling_design/tiangong_entity_modeling' }
  )

  const resolved=resolveRequestedProjectMenu({
    menuConfig: siblingMenu,
    bindings: siblingBindings,
    prototypeId: '42',
    menuPath: ['modeling_design']
  })
  assert.equal(resolved.target.node.label,'天宫业务域实体建模')
  assert.equal(resolved.fallback,false)
})

test('does not fall back to the first unbound leaf when a specific target was requested',()=>{
  const missed=resolveRequestedProjectMenu({
    menuConfig: siblingMenu,
    bindings: siblingBindings,
    prototypeId: 'missing',
    menuPath: 'modeling_design%2Fmissing_leaf'
  })
  assert.equal(missed.target,null)
  assert.equal(missed.requested,true)
  assert.equal(missed.fallback,false)

  const defaultEntry=resolveRequestedProjectMenu({
    menuConfig: siblingMenu,
    bindings: siblingBindings
  })
  assert.equal(defaultEntry.target.node.label,'天宫业务域实体建模')
  assert.equal(defaultEntry.fallback,true)
})

test('restores a bound sibling from encoded or split menuPath without using the first leaf',()=>{
  const encoded=resolveRequestedProjectMenu({
    menuConfig: siblingMenu,
    bindings: siblingBindings,
    menuPath: 'modeling_design%2Ftiangong_entity_modeling'
  })
  assert.equal(encoded.target.node.key,'tiangong_entity_modeling')

  const split=resolveRequestedProjectMenu({
    menuConfig: siblingMenu,
    bindings: siblingBindings,
    menuPath: ['modeling_design','tiangong_entity_modeling']
  })
  assert.equal(split.target.node.key,'tiangong_entity_modeling')
  assert.notEqual(listMenuLeaves(siblingMenu)[0].node.key,'tiangong_entity_modeling')
})
