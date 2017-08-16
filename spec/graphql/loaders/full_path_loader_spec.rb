require 'spec_helper'

describe Loaders::FullPathLoader do
  include GraphqlHelpers

  set(:project1) { create(:project) }
  set(:project2) { create(:project) }

  set(:other_project) { create(:project) }

  describe '.project' do
    it 'batch-resolves projects by full path' do
      paths = [project1.full_path, project2.full_path]

      result = batch(max_queries: 1) do
        paths.map { |path| resolve_project(path) }
      end

      expect(result).to contain_exactly(project1, project2)
    end

    it 'resolves an unknown full_path to nil' do
      result = batch { resolve_project('unknown/project') }

      expect(result).to be_nil
    end

    it 'returns a promise' do
      batch do
        expect(resolve_project(project1.full_path)).to be_a(Promise)
      end
    end
  end

  def resolve_project(full_path)
    resolve(described_class, :project, args: { full_path: full_path })
  end
end
