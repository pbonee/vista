# Generated by Django 3.1.3 on 2020-11-23 05:19

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('gsportal', '0004_auto_20201113_0524'),
    ]

    operations = [
        migrations.CreateModel(
            name='AlertQ',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('alertmessage', models.CharField(max_length=30)),
                ('created', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ('created',),
            },
        ),
    ]
