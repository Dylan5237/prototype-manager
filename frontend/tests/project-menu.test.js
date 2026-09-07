import test from 'node:test'
import assert from 'node:assert/strict'
import { findFirstBoundMenu, findMenuByPath, listMenuLeaves, normalizeMenuConfigForBindings } from '../src/utils/project-menu.js'

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
