Jekyll::Hooks.register [:pages, :documents], :pre_render do |doc|
  doc.content.gsub!(/(?<!\\)\|\|(.+?)\|\|/m, '<span class="spoiler">\1</span>')

  doc.content.gsub!(/\\\|\|/, '||')
end
